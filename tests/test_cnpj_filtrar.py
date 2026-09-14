# -*- coding: utf-8 -*-
"""Testes do filtro de uma parte de Estabelecimentos (sem rede): zip Latin-1 em memória."""

import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cnpj import filtrar  # noqa: E402
from etl import common  # noqa: E402

NUM_CAMPOS = 30


def linha_estabele(**campos) -> list[str]:
    """Linha de 30 campos no layout do ESTABELE, com identificadores de mentira."""
    base = ["12345678", "0001", "91", "1", "NOME FANTASIA", "02", "20180406", "00", "", "",
            "20180406", "8630504", "", "RUA", "DAS FLORES", "100", "SALA 1", "CENTRO",
            "80010000", "PR", "7535", "41", "33334444", "", "", "", "", "contato@exemplo.com",
            "", ""]
    indice = {"matriz": 3, "fantasia": 4, "situacao": 5, "data_inicio": 10, "cnae": 11,
              "secundarias": 12, "logradouro": 14, "uf": 19, "municipio": 20, "email": 27}
    for nome, valor in campos.items():
        base[indice[nome]] = valor
    assert len(base) == NUM_CAMPOS
    return base


def serializar_latin1(linhas: list[list[str]]) -> bytes:
    """Todos os campos entre aspas, aspas internas duplicadas, CRLF, Latin-1."""
    def campo(v: str) -> str:
        return '"' + v.replace('"', '""') + '"'
    return "\r\n".join(";".join(campo(c) for c in l) for l in linhas).encode("latin-1") + b"\r\n"


LINHAS = [
    # clínica ativa em Curitiba, acentos no nome, secundárias sem saúde (veterinária não conta)
    linha_estabele(fantasia="CLÍNICA SÃO JOÃO E AÇÃO", cnae="8630504", secundarias="8599699,4771704"),
    # hospital baixado, filial, TOM de Arapuã com zero à esquerda
    linha_estabele(matriz="2", situacao="08", data_inicio="20100101", cnae="8610101",
                   municipio="0830", fantasia="HOSPITAL SÃO JOSÉ"),
    # supermercado com CNAE secundário de saúde: entra como secundária
    linha_estabele(cnae="4711302", secundarias=" 8650001 , 4771704", municipio="0830"),
    # veterinária como principal e sem secundária: fora
    linha_estabele(cnae="4771704"),
    # padaria: fora
    linha_estabele(cnae="1091101", secundarias="4721102"),
    # farmácia em SC: fora (outra UF)
    linha_estabele(cnae="4771701", uf="SC", municipio="8105"),
    # farmácia ativa com ';', aspas e quebra de linha dentro de campos entre aspas
    linha_estabele(cnae="4771701", fantasia='FARMÁCIA "POPULAR"; LTDA', logradouro="RUA A\nB",
                   data_inicio="20240115"),
]


def zip_estabele(caminho: Path, linhas: list[list[str]], membro: str = "K3241.K03200Y5.D60808.ESTABELE") -> Path:
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(membro, serializar_latin1(linhas))
    return caminho


@pytest.fixture
def zip_parte(tmp_path: Path) -> Path:
    return zip_estabele(tmp_path / "Estabelecimentos5.zip", LINHAS)


# ── Leitura ─────────────────────────────────────────────────────────────

def test_ler_linhas_decodifica_latin1_e_respeita_aspas(zip_parte: Path):
    linhas = list(filtrar.ler_linhas(zip_parte))
    assert len(linhas) == 7
    assert all(len(l) == NUM_CAMPOS for l in linhas)
    assert linhas[0][4] == "CLÍNICA SÃO JOÃO E AÇÃO"  # ã, ç, é sobrevivem ao decode
    assert linhas[1][4] == "HOSPITAL SÃO JOSÉ"
    assert linhas[6][4] == 'FARMÁCIA "POPULAR"; LTDA'
    assert linhas[6][14] == "RUA A\nB"


def test_ler_linhas_rejeita_zip_com_mais_de_um_membro_ou_invalido(tmp_path: Path):
    ruim = tmp_path / "ruim.zip"
    with zipfile.ZipFile(ruim, "w") as zf:
        zf.writestr("a", b"1")
        zf.writestr("b", b"2")
    with pytest.raises(common.FonteIndisponivel):
        list(filtrar.ler_linhas(ruim))
    truncado = tmp_path / "truncado.zip"
    truncado.write_bytes(b"PK\x03\x04 nada")
    with pytest.raises(common.FonteIndisponivel):
        list(filtrar.ler_linhas(truncado))


# ── Filtro ──────────────────────────────────────────────────────────────

def test_filtrar_linhas_mantem_so_pr_e_saude(zip_parte: Path):
    linhas, contagem = filtrar.filtrar_linhas(filtrar.ler_linhas(zip_parte))
    assert contagem == filtrar.Contagem(total=7, uf=6, saude=4)
    assert [l.cnae_principal for l in linhas] == ["8630504", "8610101", "4711302", "4771701"]
    clinica, hospital, mercado, farmacia = linhas
    assert clinica == filtrar.LinhaReduzida("1", "02", "20180406", "8630504", (), "7535")
    assert hospital.matriz_filial == "2" and hospital.situacao == "08" and hospital.tom == "0830"
    assert mercado.cnaes_secundarias_saude == ("8650001",)  # veterinária fora, espaços ignorados
    assert farmacia.data_inicio == "20240115"


def test_filtrar_linhas_falha_com_contagem_de_campos_errada():
    curta = linha_estabele()[:29]
    with pytest.raises(common.FonteIndisponivel, match="29 campos"):
        filtrar.filtrar_linhas([linha_estabele(), curta])


def test_filtrar_linhas_falha_sem_linhas_do_pr():
    with pytest.raises(common.FonteIndisponivel, match="nenhuma linha da UF PR"):
        filtrar.filtrar_linhas([linha_estabele(uf="SC"), linha_estabele(uf="SP")])


# ── Escrita (LGPD) ──────────────────────────────────────────────────────

def test_serializar_tem_cabecalho_exato_e_nenhum_identificador(zip_parte: Path):
    linhas, _ = filtrar.filtrar_linhas(filtrar.ler_linhas(zip_parte))
    texto = filtrar.serializar(linhas)
    assert texto.splitlines()[0] == "matriz_filial;situacao;data_inicio;cnae_principal;cnaes_secundarias_saude;tom"
    assert filtrar.CABECALHO == ("matriz_filial", "situacao", "data_inicio", "cnae_principal",
                                 "cnaes_secundarias_saude", "tom")
    assert texto.splitlines()[1] == "1;02;20180406;8630504;;7535"
    assert texto.splitlines()[3] == "1;02;20180406;4711302;8650001;0830"
    for proibido in ("12345678", "CLÍNICA", "SÃO", "FARMÁCIA", "RUA", "FLORES",
                     "80010000", "33334444", "@", "exemplo", "CENTRO", "POPULAR"):
        assert proibido not in texto
    # A ordem "0001" não pode ser testada por substring (o CNAE 8650-0/01 termina em
    # 0001): confere-se campo a campo que nenhuma coluna é a ordem ou o DV "91".
    campos = [c for linha in texto.splitlines()[1:] for c in linha.split(";")]
    assert "0001" not in campos and "91" not in campos
    assert texto.endswith("\n") and '"' not in texto


def test_processar_grava_csv_utf8_e_conta(zip_parte: Path, tmp_path: Path):
    destino = tmp_path / "saida" / "parte_5.csv"
    contagem = filtrar.processar(zip_parte, destino)
    assert contagem.saude == 4
    linhas = destino.read_text(encoding="utf-8").splitlines()
    assert len(linhas) == 5
    assert linhas[0].split(";") == list(filtrar.CABECALHO)
    assert not destino.with_name("parte_5.csv.tmp").exists()


def test_main_com_zip_nao_baixa_nem_apaga_o_zip(zip_parte: Path, tmp_path: Path, monkeypatch):
    saida = tmp_path / "parte_5.csv"
    monkeypatch.setattr(sys, "argv", ["filtrar.py", "--parte", "5", "--zip", str(zip_parte),
                                      "--saida", str(saida)])
    monkeypatch.setattr(filtrar.webdav, "baixar", lambda *a, **k: pytest.fail("baixou"))
    assert filtrar.main() == 0
    assert saida.exists() and zip_parte.exists()


def test_main_devolve_1_quando_a_parte_nao_tem_pr(tmp_path: Path, monkeypatch):
    zip_sc = zip_estabele(tmp_path / "sc.zip", [linha_estabele(uf="SC")])
    monkeypatch.setattr(sys, "argv", ["filtrar.py", "--parte", "0", "--zip", str(zip_sc),
                                      "--saida", str(tmp_path / "parte_0.csv")])
    assert filtrar.main() == 1
    assert not (tmp_path / "parte_0.csv").exists()
