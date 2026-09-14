# -*- coding: utf-8 -*-
"""Testes do cliente WebDAV da camada CNPJ (sem rede: respostas simuladas)."""

import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cnpj import webdav  # noqa: E402
from etl import common  # noqa: E402

CFG = webdav.Config(tentativas=3, backoff=0.0)


def resposta_propfind(itens: list[tuple[str, bool, int | None]]) -> str:
    """XML 207 no formato do Nextcloud (namespace DAV:, href codificado)."""
    blocos = []
    for nome, pasta, tamanho in itens:
        tipo = "<d:resourcetype><d:collection/></d:resourcetype>" if pasta else "<d:resourcetype/>"
        tam = f"<d:getcontentlength>{tamanho}</d:getcontentlength>" if tamanho is not None else ""
        blocos.append(f"<d:response><d:href>/public.php/webdav/{nome}{'/' if pasta else ''}</d:href>"
                      f"<d:propstat><d:prop>{tipo}{tam}</d:prop>"
                      f"<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>")
    return ('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' + "".join(blocos)
            + "</d:multistatus>")


RAIZ = [("", True, None), ("2026-07", True, None), ("2026-08", True, None),
        ("2023-05", True, None), ("cnpj.tar.gz", False, 63_954_782_749), ("leia-me", True, None)]
COMPLETA = [("2026-07", True, None)] + [(f"Estabelecimentos{i}.zip", False, 300 + i)
                                        for i in range(10)] + [("Cnaes.zip", False, 22078)]
INCOMPLETA = [("2026-08", True, None)] + [(f"Estabelecimentos{i}.zip", False, 300 + i)
                                          for i in range(9)] + [("Estabelecimentos9.zip", False, 0)]


def test_interpretar_propfind_le_nome_tipo_e_tamanho():
    entradas = webdav.interpretar_propfind(resposta_propfind(RAIZ))
    por_nome = {e.nome: e for e in entradas}
    assert por_nome["2026-08"].pasta is True and por_nome["2026-08"].tamanho is None
    assert por_nome["cnpj.tar.gz"].pasta is False
    assert por_nome["cnpj.tar.gz"].tamanho == 63_954_782_749


def test_interpretar_propfind_rejeita_xml_invalido():
    with pytest.raises(common.FonteIndisponivel):
        webdav.interpretar_propfind("<html>erro</html><")


def test_pastas_disponiveis_ignora_arquivos_e_nomes_fora_do_padrao():
    entradas = webdav.interpretar_propfind(resposta_propfind(RAIZ))
    assert webdav.pastas_disponiveis(entradas) == ("2023-05", "2026-07", "2026-08")


def test_partes_presentes_exige_tamanho_maior_que_zero():
    completa = webdav.interpretar_propfind(resposta_propfind(COMPLETA))
    incompleta = webdav.interpretar_propfind(resposta_propfind(INCOMPLETA))
    assert webdav.partes_presentes(completa) == frozenset(range(10))
    assert webdav.partes_presentes(incompleta) == frozenset(range(9))


def test_pasta_mais_recente_volta_uma_competencia_se_a_ultima_esta_incompleta(monkeypatch):
    listagens = {"": RAIZ, "2026-08/": INCOMPLETA, "2026-07/": COMPLETA}
    consultas = []

    def propfind_falso(caminho, http=None, cfg=webdav.CONFIG):
        consultas.append(caminho)
        return webdav.interpretar_propfind(resposta_propfind(listagens[caminho]))

    monkeypatch.setattr(webdav, "propfind", propfind_falso)
    assert webdav.pasta_mais_recente(http=object(), cfg=CFG) == "2026-07"
    assert consultas == ["", "2026-08/", "2026-07/"]


def test_pasta_mais_recente_falha_sem_pasta_completa(monkeypatch):
    monkeypatch.setattr(webdav, "propfind", lambda caminho, http=None, cfg=None:
                        webdav.interpretar_propfind(resposta_propfind(
                            RAIZ if caminho == "" else INCOMPLETA)))
    with pytest.raises(common.FonteIndisponivel):
        webdav.pasta_mais_recente(http=object(), cfg=CFG)


def test_url_parte_valida_pasta_e_indice():
    assert webdav.url_parte("2026-08", 5) == (
        "https://arquivos.receitafederal.gov.br/public.php/webdav/2026-08/Estabelecimentos5.zip")
    with pytest.raises(ValueError):
        webdav.url_parte("2026-8", 5)
    with pytest.raises(ValueError):
        webdav.url_parte("2026-08", 10)


def test_autenticacao_usa_token_publico_com_senha_vazia():
    assert webdav.autenticacao() == ("YggdBLfdninEJX9", "")


# ── Download com retomada ───────────────────────────────────────────────

class RespostaFalsa:
    def __init__(self, status: int, cabecalhos: dict, pedacos: list[bytes],
                 falha_no_meio: bool = False):
        self.status_code = status
        self.headers = cabecalhos
        self._pedacos = pedacos
        self._falha = falha_no_meio

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def iter_content(self, chunk_size: int):
        for p in self._pedacos:
            yield p
        if self._falha:
            raise requests.ConnectionError("conexão caiu")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class HttpFalso:
    def __init__(self, respostas: list):
        self._respostas = list(respostas)
        self.chamadas: list[dict] = []

    def get(self, url, stream=False, headers=None, auth=None, timeout=None):
        self.chamadas.append(dict(headers or {}))
        resposta = self._respostas.pop(0)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta


def test_baixar_retoma_por_range_apos_queda(tmp_path):
    conteudo = b"abcdefghij"
    http = HttpFalso([
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcd"], falha_no_meio=True),
        RespostaFalsa(206, {"Content-Range": "bytes 4-9/10"}, [b"efg", b"hij"]),
    ])
    destino = tmp_path / "parte.zip"
    assert webdav.baixar("http://x/parte.zip", destino, http=http, cfg=CFG) == 10
    assert destino.read_bytes() == conteudo
    assert http.chamadas == [{}, {"Range": "bytes=4-"}]


def test_baixar_recomeca_se_o_servidor_ignora_o_range(tmp_path):
    destino = tmp_path / "parte.zip"
    destino.write_bytes(b"lixo")
    http = HttpFalso([RespostaFalsa(200, {"Content-Length": "5"}, [b"certo"])])
    assert webdav.baixar("http://x/p", destino, http=http, cfg=CFG) == 5
    assert destino.read_bytes() == b"certo"


def test_baixar_falha_se_o_tamanho_para_de_avancar(tmp_path):
    # Três respostas curtas que avançam não gastam tentativa; três seguidas sem
    # nenhum byte novo (206 vazio no ponto certo) esgotam cfg.tentativas = 3.
    http = HttpFalso([RespostaFalsa(200, {"Content-Length": "9"}, [b"abc"]),
                      RespostaFalsa(206, {"Content-Range": "bytes 3-8/9"}, [b"de"]),
                      RespostaFalsa(206, {"Content-Range": "bytes 5-8/9"}, [b"f"])]
                     + [RespostaFalsa(206, {"Content-Range": "bytes 6-8/9"}, [])] * 3)
    with pytest.raises(common.FonteIndisponivel, match="3 seguidas sem avanço"):
        webdav.baixar("http://x/p", tmp_path / "p.zip", http=http, cfg=CFG)
    assert len(http.chamadas) == 6
    assert (tmp_path / "p.zip").read_bytes() == b"abcdef"


def test_baixar_tenta_de_novo_apos_timeout_e_falha_apos_esgotar(tmp_path):
    http = HttpFalso([requests.ReadTimeout("mudo")] * 3)
    with pytest.raises(common.FonteIndisponivel):
        webdav.baixar("http://x/p", tmp_path / "p.zip", http=http, cfg=CFG)
    assert len(http.chamadas) == 3


def test_baixar_quedas_com_avanco_nao_gastam_tentativas(tmp_path):
    # cfg.tentativas = 2, mas o download sobrevive a 2 quedas e 2 travamentos
    # porque cada queda veio depois de bytes novos em disco.
    cfg = webdav.Config(tentativas=2, backoff=0.0)
    http = HttpFalso([
        RespostaFalsa(200, {"Content-Length": "10"}, [b"ab"], falha_no_meio=True),
        requests.ReadTimeout("mudo"),
        RespostaFalsa(206, {"Content-Range": "bytes 2-9/10"}, [b"cd"], falha_no_meio=True),
        requests.ReadTimeout("mudo"),
        RespostaFalsa(206, {"Content-Range": "bytes 4-9/10"}, [b"efghij"]),
    ])
    destino = tmp_path / "parte.zip"
    assert webdav.baixar("http://x/parte.zip", destino, http=http, cfg=cfg) == 10
    assert destino.read_bytes() == b"abcdefghij"
    assert [c.get("Range") for c in http.chamadas] == [None, "bytes=2-", "bytes=2-", "bytes=4-",
                                                       "bytes=4-"]


def test_baixar_respeita_o_teto_absoluto_mesmo_com_avanco(tmp_path):
    cfg = webdav.Config(tentativas=2, teto_tentativas=3, backoff=0.0)
    http = HttpFalso([RespostaFalsa(200, {"Content-Length": "100"}, [b"a"], falha_no_meio=True),
                      RespostaFalsa(206, {"Content-Range": "bytes 1-99/100"}, [b"b"], True),
                      RespostaFalsa(206, {"Content-Range": "bytes 2-99/100"}, [b"c"], True),
                      RespostaFalsa(206, {"Content-Range": "bytes 3-99/100"}, [b"d"], True)])
    with pytest.raises(common.FonteIndisponivel, match="após 3 tentativas"):
        webdav.baixar("http://x/p", tmp_path / "p.zip", http=http, cfg=cfg)
    assert len(http.chamadas) == 3


# ── Retomada por Range: o 206 tem de ser o trecho pedido ────────────────

def test_baixar_descarta_o_parcial_se_o_206_vem_sem_content_range(tmp_path):
    # 6 de 10 bytes chegaram num 206 sem Content-Range: não pode ser aceito como
    # completo (total desconhecido); o parcial é descartado e recomeça do zero.
    http = HttpFalso([
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcd"], falha_no_meio=True),
        RespostaFalsa(206, {}, [b"ef"]),
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcdefghij"]),
    ])
    destino = tmp_path / "parte.zip"
    assert webdav.baixar("http://x/parte.zip", destino, http=http, cfg=CFG) == 10
    assert destino.read_bytes() == b"abcdefghij"
    assert http.chamadas == [{}, {"Range": "bytes=4-"}, {}]


def test_baixar_descarta_o_parcial_se_o_206_comeca_em_outra_posicao(tmp_path):
    # 4 bytes em disco, servidor responde 'bytes 0-5/10': anexar daria 'abcdabcdef'
    # com o tamanho certo e o conteúdo errado. Tem de descartar e recomeçar.
    http = HttpFalso([
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcd"], falha_no_meio=True),
        RespostaFalsa(206, {"Content-Range": "bytes 0-5/10"}, [b"abcdef"]),
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcdefghij"]),
    ])
    destino = tmp_path / "parte.zip"
    assert webdav.baixar("http://x/parte.zip", destino, http=http, cfg=CFG) == 10
    assert destino.read_bytes() == b"abcdefghij"
    assert http.chamadas == [{}, {"Range": "bytes=4-"}, {}]


def test_baixar_reusa_o_total_da_primeira_resposta_quando_o_206_nao_o_traz(tmp_path):
    # 'bytes 4-9/*' não anuncia o total: os 10 bytes do Content-Length inicial
    # continuam valendo, então 6 bytes ainda contam como incompleto.
    http = HttpFalso([
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcd"], falha_no_meio=True),
        RespostaFalsa(206, {"Content-Range": "bytes 4-9/*"}, [b"ef"]),
        RespostaFalsa(206, {"Content-Range": "bytes 6-9/*"}, [b"ghij"]),
    ])
    destino = tmp_path / "parte.zip"
    assert webdav.baixar("http://x/parte.zip", destino, http=http, cfg=CFG) == 10
    assert destino.read_bytes() == b"abcdefghij"
    assert http.chamadas == [{}, {"Range": "bytes=4-"}, {"Range": "bytes=6-"}]


def test_baixar_recomeca_se_o_total_anunciado_muda(tmp_path):
    http = HttpFalso([
        RespostaFalsa(200, {"Content-Length": "10"}, [b"abcd"], falha_no_meio=True),
        RespostaFalsa(206, {"Content-Range": "bytes 4-11/12"}, [b"efgh"]),
        RespostaFalsa(200, {"Content-Length": "12"}, [b"abcdefghijkl"]),
    ])
    destino = tmp_path / "parte.zip"
    assert webdav.baixar("http://x/parte.zip", destino, http=http, cfg=CFG) == 12
    assert destino.read_bytes() == b"abcdefghijkl"
    assert http.chamadas == [{}, {"Range": "bytes=4-"}, {}]


# ── Espelho (autoindex do Apache) ───────────────────────────────────────

def linha_indice(href: str, tamanho: str) -> str:
    """Uma <tr> no formato do autoindex do espelho (verificado em 2026-09-13)."""
    return (f'<tr><td valign="top"><img src="/icons/compressed.gif" alt="[   ]"></td>'
            f'<td><a href="{href}">{href}</a>  </td><td align="right">2026-08-20 18:18  </td>'
            f'<td align="right">{tamanho}</td><td>&nbsp;</td></tr>\n')


def indice(linhas: list[tuple[str, str]]) -> str:
    cabecalho = ('<tr><th valign="top"><img src="/icons/blank.gif" alt="[ICO]"></th>'
                 '<th><a href="?C=N;O=D">Name</a></th></tr>\n'
                 '<tr><td valign="top"><img src="/icons/back.gif" alt="[PARENTDIR]"></td>'
                 '<td><a href="/">Parent Directory</a></td><td>&nbsp;</td>'
                 '<td align="right">  - </td><td>&nbsp;</td></tr>\n')
    corpo = "".join(linha_indice(h, t) for h, t in linhas)
    return (f"<html><body><h1>Index of /arquivos</h1><table>{cabecalho}{corpo}</table>"
            "<script>(function(){/* desafio do Cloudflare */})();</script></body></html>")


RAIZ_ESPELHO = indice([("2026-06-14/", "  - "), ("2026-07-12/", "  - "), ("2026-07-30/", "  - "),
                       ("2026-08-09/", "  - "), ("leia-me.txt", "1.2K")])
COPIA_COMPLETA = indice([("Cnaes.zip", " 22K"), ("Estabelecimentos0.zip", "2.0G")]
                        + [(f"Estabelecimentos{i}.zip", "320M") for i in range(1, 10)])
COPIA_INCOMPLETA = indice([(f"Estabelecimentos{i}.zip", "320M") for i in range(9)]
                          + [("Estabelecimentos9.zip", "  0 ")])


def test_tamanho_aproximado_le_o_formato_humano_do_apache():
    assert webdav.tamanho_aproximado("320M") == 320 << 20
    assert webdav.tamanho_aproximado(" 22K") == 22 << 10
    assert webdav.tamanho_aproximado("2.0G") == 2 << 30
    assert webdav.tamanho_aproximado("0") == 0
    assert webdav.tamanho_aproximado("-") is None


def test_interpretar_indice_ignora_parent_ordenacao_e_script():
    entradas = webdav.interpretar_indice(RAIZ_ESPELHO)
    assert [e.nome for e in entradas] == ["2026-06-14", "2026-07-12", "2026-07-30", "2026-08-09",
                                          "leia-me.txt"]
    assert all(e.pasta for e in entradas[:4]) and not entradas[4].pasta
    assert webdav.partes_presentes(webdav.interpretar_indice(COPIA_COMPLETA)) == frozenset(range(10))
    assert webdav.partes_presentes(webdav.interpretar_indice(COPIA_INCOMPLETA)) == frozenset(range(9))


def test_pastas_espelho_mapeia_competencia_para_a_copia_mais_recente_do_mes():
    mapa = webdav.pastas_espelho(webdav.interpretar_indice(RAIZ_ESPELHO))
    assert mapa == {"2026-06": "2026-06-14", "2026-07": "2026-07-30", "2026-08": "2026-08-09"}


class HttpIndice:
    def __init__(self, paginas: dict[str, str]):
        self._paginas = paginas
        self.urls: list[str] = []

    def get(self, url, timeout=None, **_):
        self.urls.append(url)
        caminho = url.removeprefix(webdav.URL_ESPELHO)
        return RespostaIndice(self._paginas.get(caminho))


class RespostaIndice:
    def __init__(self, html: str | None):
        self.status_code = 200 if html is not None else 404
        self.text = html or ""

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")


def test_pasta_mais_recente_no_espelho_volta_uma_competencia_se_a_ultima_esta_incompleta():
    http = HttpIndice({"": RAIZ_ESPELHO, "2026-08-09/": COPIA_INCOMPLETA,
                       "2026-07-30/": COPIA_COMPLETA})
    assert webdav.pasta_mais_recente(http=http, cfg=CFG, fonte="espelho") == "2026-07"
    assert [u.removeprefix(webdav.URL_ESPELHO) for u in http.urls] == ["", "2026-08-09/",
                                                                       "2026-07-30/"]


def test_listar_espelho_falha_com_pagina_sem_entradas():
    # Um desafio do Cloudflare ou um layout novo não pode virar "nenhuma pasta".
    http = HttpIndice({"": "<html><body>Just a moment...</body></html>"})
    with pytest.raises(common.FonteIndisponivel, match="índice vazio"):
        webdav.listar_espelho("", http=http, cfg=CFG)


def test_localizar_parte_no_espelho_usa_a_pasta_da_copia_e_nao_autentica():
    http = HttpIndice({"": RAIZ_ESPELHO})
    url, autenticar = webdav.localizar_parte("espelho", "2026-08", 5, http=http, cfg=CFG)
    assert url == webdav.URL_ESPELHO + "2026-08-09/Estabelecimentos5.zip"
    assert autenticar is False
    assert webdav.localizar_parte("oficial", "2026-08", 5) == (
        webdav.URL_BASE + "2026-08/Estabelecimentos5.zip", True)


def test_pasta_espelho_falha_se_a_competencia_nao_foi_copiada():
    http = HttpIndice({"": RAIZ_ESPELHO})
    with pytest.raises(common.FonteIndisponivel, match="2026-09 não está no espelho"):
        webdav.pasta_espelho("2026-09", http=http, cfg=CFG)


def test_url_parte_espelho_valida_a_data_da_copia():
    assert webdav.url_parte_espelho("2026-08-09", 0).endswith("/2026-08-09/Estabelecimentos0.zip")
    with pytest.raises(ValueError):
        webdav.url_parte_espelho("2026-08", 0)


def test_escolher_fonte_auto_cai_para_o_espelho_quando_a_oficial_nao_responde(monkeypatch):
    chamadas = []

    def propfind_mudo(caminho, http=None, cfg=webdav.CONFIG):
        chamadas.append((cfg.tentativas, cfg.timeout_conexao))
        raise common.FonteIndisponivel("PROPFIND /: sem sucesso após 1 tentativas")

    monkeypatch.setattr(webdav, "propfind", propfind_mudo)
    assert webdav.escolher_fonte("auto") == "espelho"
    assert chamadas == [(1, webdav.CONFIG.timeout_sonda)]  # uma sonda curta, não 6 tentativas
    assert webdav.escolher_fonte("oficial") == "oficial"  # forçada: nem sonda
    assert len(chamadas) == 1
    with pytest.raises(ValueError):
        webdav.escolher_fonte("ftp")


def test_escolher_fonte_auto_fica_na_oficial_quando_ela_responde(monkeypatch):
    monkeypatch.setattr(webdav, "propfind", lambda caminho, http=None, cfg=None: ())
    assert webdav.escolher_fonte("auto") == "oficial"


def test_baixar_do_espelho_nao_envia_basic_auth(tmp_path):
    enviados = []

    class HttpAuth(HttpFalso):
        def get(self, url, stream=False, headers=None, auth=None, timeout=None):
            enviados.append(auth)
            return super().get(url, stream, headers, auth, timeout)

    http = HttpAuth([RespostaFalsa(200, {"Content-Length": "3"}, [b"abc"])])
    webdav.baixar("http://espelho/p.zip", tmp_path / "p.zip", http=http, cfg=CFG, autenticar=False)
    http = HttpAuth([RespostaFalsa(200, {"Content-Length": "3"}, [b"abc"])])
    webdav.baixar("http://oficial/p.zip", tmp_path / "q.zip", http=http, cfg=CFG)
    assert enviados == [None, ("YggdBLfdninEJX9", "")]


def test_interpretar_content_range_aceita_so_o_formato_bytes():
    assert webdav.interpretar_content_range("bytes 4-9/10") == (4, 10)
    assert webdav.interpretar_content_range("bytes 4-9/*") == (4, None)
    assert webdav.interpretar_content_range("") is None
    assert webdav.interpretar_content_range("bytes */10") is None
    assert webdav.interpretar_content_range("items 4-9/10") is None
