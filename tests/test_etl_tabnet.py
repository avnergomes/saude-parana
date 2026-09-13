"""Testes do cliente TabNet (scripts/etl/tabnet.py), sem rede.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import tabnet  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

FORM_HTML = """<html><body>
<FORM ACTION="/cgi/tabcgi.exe?sim/cnv/obt10pr.def" METHOD=POST>
<SELECT NAME="Linha" ID="L" SIZE=4>
<OPTION VALUE="Município" SELECTED>Munic&iacute;pio
<OPTION VALUE="Capítulo_CID-10">Cap&iacute;tulo CID-10
</SELECT>
<SELECT NAME="Incremento" ID="I" SIZE=4 MULTIPLE>
<OPTION VALUE="Óbitos_p/Residênc" SELECTED>&Oacute;bitos p/Resid&ecirc;nc
</SELECT>
<SELECT NAME="Arquivos" ID="A" SIZE=4 MULTIPLE>
<OPTION VALUE="obtpr26.dbf" SELECTED >2026
<OPTION VALUE="obtpr25.dbf">2025
</SELECT>
</FORM></body></html>"""

CSV_SIM = (
    " Mortalidade - Paraná\n"
    "Óbitos p/Residênc por Município e Capítulo CID-10\n"
    "Período:2024\n"
    '"Município";"Cap I";"Cap II";"Cap XX";"Total"\n'
    '" MUNICIPIO IGNORADO - PR";1;3;45;49\n'
    '"410010 ABATIA";5;13;7;25\n'
    '"410020 ADRIANOPOLIS";-;10;8;18\n'
    '"Total";6;26;60;92\n'
    " Fonte: MS/SVSA/CGIAE - Sistema de Informações sobre Mortalidade - SIM\n"
    " Dados finais disponíveis até 2024 - data de extração 02/12/2025.\n"
)

CSV_SIOPS = (
    "Indicadores Municipais\n"
    "População2.1 D.Total Saúde/Hab por Munic-BR\n"
    "UF: Paraná\n"
    "Período:2025\n"
    '"Munic-BR";"População";"2.1_D.Total_Saúde/Hab"\n'
    '"410010 Abatiá";7233;1791,39\n'
    '"412880 Xambrê";5835;-\n'
    '"Total";13068;1732,31\n'
)

PAGINA_COM_CSV = (
    '<html><body><table><tr><td>...</td></tr></table>'
    '<td class="botao_opcao"><A HREF=/csv/sim_cnv_obt10pr1.csv>Copia como .CSV</A>'
    "</body></html>"
)


class RespostaFalsa:
    def __init__(self, conteudo: bytes, status: int = 200):
        self.content = conteudo
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")


class SessaoFalsa:
    """Sessão que registra as chamadas e devolve respostas pré-definidas."""

    def __init__(self, respostas):
        self.respostas = list(respostas)
        self.chamadas = []

    def request(self, metodo, url, **kwargs):
        self.chamadas.append((metodo, url, kwargs))
        resposta = self.respostas.pop(0)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta


@pytest.fixture(autouse=True)
def sem_pausa(monkeypatch):
    monkeypatch.setattr(tabnet, "PAUSA", 0)


# ── Formulário ──────────────────────────────────────────────────────────

def test_ler_opcoes_decodifica_entidades_e_preserva_values():
    assert tabnet.ler_opcoes(FORM_HTML, "Linha") == {
        "Município": "Município", "Capítulo CID-10": "Capítulo_CID-10",
    }
    assert tabnet.ler_opcoes(FORM_HTML, "Arquivos") == {"2026": "obtpr26.dbf", "2025": "obtpr25.dbf"}
    assert tabnet.ler_opcoes(FORM_HTML, "Incremento") == {"Óbitos p/Residênc": "Óbitos_p/Residênc"}


def test_ler_opcoes_select_ausente_falha():
    with pytest.raises(FonteIndisponivel):
        tabnet.ler_opcoes(FORM_HTML, "Coluna")


def test_baixar_formulario_decodifica_iso_8859_1():
    http = SessaoFalsa([RespostaFalsa(FORM_HTML.encode("iso-8859-1"))])
    html = tabnet.baixar_formulario("sim/cnv/obt10pr.def", http=http)
    assert 'VALUE="Município"' in html
    assert http.chamadas[0][:2] == ("GET", "http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sim/cnv/obt10pr.def")


# ── Consulta (POST + CSV) ───────────────────────────────────────────────

def test_consultar_envia_corpo_iso_8859_1_e_baixa_csv():
    http = SessaoFalsa([
        RespostaFalsa(PAGINA_COM_CSV.encode("iso-8859-1")),
        RespostaFalsa(CSV_SIM.replace("\n", "\r\n").encode("iso-8859-1")),
    ])
    campos = {"Linha": "Município", "Incremento": "Óbitos_p/Residênc",
              "Arquivos": ["obtpr24.dbf", "obtpr25.dbf"], "formato": "table", "mostre": "Mostra"}
    texto = tabnet.consultar("sim/cnv/obt10pr.def", campos, http=http)

    metodo, url, kwargs = http.chamadas[0]
    assert (metodo, url) == ("POST", "http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sim/cnv/obt10pr.def")
    assert kwargs["data"] == (b"Linha=Munic%EDpio&Incremento=%D3bitos_p%2FResid%EAnc"
                              b"&Arquivos=obtpr24.dbf&Arquivos=obtpr25.dbf&formato=table&mostre=Mostra")
    assert kwargs["headers"]["Content-Type"] == "application/x-www-form-urlencoded"
    assert kwargs["timeout"] == 120
    assert http.chamadas[1][:2] == ("GET", "http://tabnet.datasus.gov.br/csv/sim_cnv_obt10pr1.csv")
    assert texto == CSV_SIM  # acentos preservados e quebras normalizadas
    assert "Óbitos p/Residênc" in texto and "Município" in texto


def test_consultar_usa_servidor_alternativo():
    http = SessaoFalsa([RespostaFalsa(PAGINA_COM_CSV.encode("iso-8859-1")),
                        RespostaFalsa(CSV_SIOPS.encode("iso-8859-1"))])
    servidor = tabnet.Servidor(host="http://siops-asp.datasus.gov.br", cgi="/CGI")
    tabnet.consultar("SIOPS/x.def", {"SUF": "21"}, servidor=servidor, http=http)
    assert http.chamadas[0][1] == "http://siops-asp.datasus.gov.br/CGI/tabcgi.exe?SIOPS/x.def"
    assert http.chamadas[1][1] == "http://siops-asp.datasus.gov.br/csv/sim_cnv_obt10pr1.csv"


def test_consultar_sem_link_csv_falha():
    http = SessaoFalsa([RespostaFalsa(b"<html><body>Erro: arquivo inexistente</body></html>")])
    with pytest.raises(FonteIndisponivel, match="sem link CSV"):
        tabnet.consultar("sim/cnv/obt10pr.def", {"Linha": "x"}, http=http)


def test_consultar_erro_http_e_excecao_de_rede_falham():
    with pytest.raises(FonteIndisponivel):
        tabnet.consultar("d.def", {}, http=SessaoFalsa([RespostaFalsa(b"", 503)]))
    with pytest.raises(FonteIndisponivel):
        tabnet.consultar("d.def", {}, http=SessaoFalsa([requests.ConnectionError("reset")]))
    with pytest.raises(FonteIndisponivel):  # falha no GET do CSV
        tabnet.consultar("d.def", {}, http=SessaoFalsa([
            RespostaFalsa(PAGINA_COM_CSV.encode("iso-8859-1")), RespostaFalsa(b"", 500)]))


# ── CSV ─────────────────────────────────────────────────────────────────

def test_numero_trata_ausentes_inteiros_e_decimais_pt_br():
    assert tabnet.numero("-") is None
    assert tabnet.numero("") is None
    assert tabnet.numero("12") == 12
    assert tabnet.numero("158414,29") == 158414.29
    assert tabnet.numero(" 30,61 ") == 30.61
    assert tabnet.numero("abc") == "abc"


def test_parse_csv_separa_codigo_e_nome_e_pula_total_e_rodape():
    registros = tabnet.parse_csv(CSV_SIM)
    assert [r["nome"] for r in registros] == ["MUNICIPIO IGNORADO - PR", "ABATIA", "ADRIANOPOLIS"]
    assert registros[0]["cod6"] is None
    assert registros[1] == {"cod6": "410010", "nome": "ABATIA",
                            "Cap I": 5, "Cap II": 13, "Cap XX": 7, "Total": 25}
    assert registros[2]["Cap I"] is None


def test_parse_csv_aceita_quatro_linhas_de_titulo_e_acentos():
    registros = tabnet.parse_csv(CSV_SIOPS)
    assert registros == [
        {"cod6": "410010", "nome": "Abatiá", "População": 7233, "2.1_D.Total_Saúde/Hab": 1791.39},
        {"cod6": "412880", "nome": "Xambrê", "População": 5835, "2.1_D.Total_Saúde/Hab": None},
    ]


def test_parse_csv_sem_cabecalho_falha():
    with pytest.raises(FonteIndisponivel):
        tabnet.parse_csv(" Mortalidade\nPeríodo:2024\n Fonte: SIM\n")


# ── Capítulos CID-10 ────────────────────────────────────────────────────

def test_romano_de_capitulo_cobre_os_rotulos_do_tabnet():
    assert tabnet.romano_de_capitulo("Cap I") == "I"
    assert tabnet.romano_de_capitulo("Cap XVIII") == "XVIII"
    assert tabnet.romano_de_capitulo("Cap 01") == "I"
    assert tabnet.romano_de_capitulo("Cap 21") == "XXI"
    assert tabnet.romano_de_capitulo("I.   Algumas doenças infecciosas e parasitárias") == "I"
    assert tabnet.romano_de_capitulo("XXII.Códigos para propósitos especiais") == "XXII"
    for rotulo in ("Total", "Município", "Internações", "Valor_total", "Óbitos", "Cap 23", "Cap XXX"):
        assert tabnet.romano_de_capitulo(rotulo) is None, rotulo


def test_tabela_capitulos_mapeia_cod7_e_descarta_ignorado():
    registros = tabnet.parse_csv(CSV_SIM)
    tabela = tabnet.tabela_capitulos(registros, {"410010": "4100103", "410020": "4100202"})
    assert tabela == {
        "4100103": {"total": 25, "I": 5, "II": 13, "XX": 7},
        "4100202": {"total": 18, "I": 0, "II": 10, "XX": 8},
    }
    assert registros[1]["Cap I"] == 5  # entrada não mutada


def test_capitulos_de_ordena_e_permite_nomes_alternativos():
    assert tabnet.capitulos_de({"XX", "I", "IX"}) == [
        {"codigo": "I", "nome": "Algumas doenças infecciosas e parasitárias"},
        {"codigo": "IX", "nome": "Doenças do aparelho circulatório"},
        {"codigo": "XX", "nome": "Causas externas de morbidade e mortalidade"},
    ]
    nomes = {**tabnet.CAPITULOS_CID10, "XXII": "CID não disponível"}
    assert tabnet.capitulos_de({"XXII"}, nomes) == [{"codigo": "XXII", "nome": "CID não disponível"}]


def test_somar_e_completar_capitulos():
    tabela = {"a": {"total": 25, "I": 5, "II": 13, "XX": 7}, "b": {"total": 18, "II": 10, "XX": 8}}
    ordem = ["I", "II", "XX", "XXI"]
    assert tabnet.somar_capitulos(tabela, ordem) == {"total": 43, "I": 5, "II": 23, "XX": 15, "XXI": 0}
    assert tabnet.completar_capitulos(tabela["b"], ordem) == {"total": 18, "I": 0, "II": 10, "XX": 8, "XXI": 0}
    assert list(tabnet.completar_capitulos(tabela["b"], ordem)) == ["total", "I", "II", "XX", "XXI"]
