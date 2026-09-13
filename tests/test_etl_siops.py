"""Testes do ETL SIOPS (scripts/etl/siops.py), sem rede.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import common, siops, tabnet  # noqa: E402

FORM_HTML = """<html><body>
<FORM ACTION="/CGI/tabcgi.exe?SIOPS/serhist/municipio/mIndicadores.def" METHOD=POST>
<SELECT NAME="Arquivos" ID="A" SIZE=4 MULTIPLE>
<OPTION VALUE="indmun25.dbf" SELECTED >2025
<OPTION VALUE="indmun24.dbf">2024
<OPTION VALUE="indmun14.dbf">2014
</SELECT>
<SELECT NAME="SUF" ID="S1" SIZE=4 MULTIPLE>
<OPTION VALUE="TODAS_AS_CATEGORIAS__" SELECTED>Todas as categorias
<OPTION VALUE="21">Paran&aacute;
</SELECT></FORM></body></html>"""

CABECALHO = ('"Munic-BR";"População";"2.1_D.Total_Saúde/Hab";"3.2_%R.Próprios_em_Saúde-EC_29";'
             '"R.Transf.SUS/Hab"\n')


def csv_siops(ano, linhas):
    return ("Indicadores Municipais\nPopulação2.1 D.Total Saúde/Hab3.2 %R.Próprios em Saúde-EC 29"
            f"R.Transf.SUS/Hab por Munic-BR\nUF: Paraná\nPeríodo:{ano}\n" + CABECALHO + linhas)


CSVS = {
    "indmun24.dbf": csv_siops(2024, '"410010 Abatiá";7000;1500,00;20,00;500,00\n'
                                    '"412880 Xambrê";6000;1000,00;18,00;400,00\n'
                                    '"410000 Município ignorado - PR";1;1;1;1\n'
                                    '"Total";13001;1269,29;19,08;453,88\n'),
    "indmun25.dbf": csv_siops(2025, '"410010 Abatiá";8000;2000,00;25,00;600,00\n'
                                    '"412880 Xambrê";6000;-;-;-\n'
                                    '"Total";14000;2000,00;25,00;600,00\n'),
}
MAPA = {"410010": "4100103", "412880": "4128807"}


def test_anos_disponiveis_respeita_ano_inicial():
    assert siops.anos_disponiveis(FORM_HTML) == {2024: "indmun24.dbf", 2025: "indmun25.dbf"}
    with pytest.raises(common.FonteIndisponivel):
        siops.anos_disponiveis('<select name="Arquivos"><option value="indmun10.dbf">2010</select>')


def test_campos_usam_os_valores_exatos_do_formulario_e_filtram_o_parana():
    assert siops.campos("indmun25.dbf") == {
        "Linha": "Munic-BR", "Coluna": "--Não-Ativa--",
        "Incremento": ["População", "2.1_D.Total_Saúde/Hab", "3.2_%R.Próprios_em_Saúde-EC_29",
                       "R.Transf.SUS/Hab"],
        "Arquivos": "indmun25.dbf", "SUF": "21", "formato": "table", "mostre": "Mostra",
    }
    assert tabnet.ler_opcoes(FORM_HTML, "SUF")["Paraná"] == siops.CONFIG.uf_parana


def test_valores_por_municipio_descarta_ignorado_e_mantem_ausentes():
    tabela = siops.valores_por_municipio(tabnet.parse_csv(CSVS["indmun25.dbf"]), MAPA)
    assert tabela == {
        "4100103": {"populacao": 8000.0, "despesa_saude_hab": 2000.0,
                    "pct_receita_propria": 25.0, "transf_sus_hab": 600.0},
        "4128807": {"populacao": 6000.0, "despesa_saude_hab": None,
                    "pct_receita_propria": None, "transf_sus_hab": None},
    }


def test_media_ponderada_pela_populacao_ignora_ausentes():
    tabela = siops.valores_por_municipio(tabnet.parse_csv(CSVS["indmun24.dbf"]), MAPA)
    # (1500*7000 + 1000*6000) / 13000
    assert siops.media_ponderada(tabela, "despesa_saude_hab") == 1269.23
    assert siops.media_ponderada(tabela, "pct_receita_propria") == 19.08
    tabela_2025 = siops.valores_por_municipio(tabnet.parse_csv(CSVS["indmun25.dbf"]), MAPA)
    assert siops.media_ponderada(tabela_2025, "transf_sus_hab") == 600.0
    assert siops.media_ponderada({}, "transf_sus_hab") is None


def _anos():
    return [
        siops.AnoSiops(ano, f"tabnet/siops_{ano}.csv",
                       siops.valores_por_municipio(tabnet.parse_csv(CSVS[arq]), MAPA))
        for ano, arq in ((2025, "indmun25.dbf"), (2024, "indmun24.dbf"))
    ]


def test_recorte_municipal_cai_para_o_ano_mais_recente_com_dado():
    recorte = siops.recorte_municipal(_anos(), 2025)
    assert recorte == {
        "4100103": {"ano": 2025, "despesa_saude_hab": 2000.0, "pct_receita_propria": 25.0,
                    "transf_sus_hab": 600.0},
        "4128807": {"ano": 2024, "despesa_saude_hab": 1000.0, "pct_receita_propria": 18.0,
                    "transf_sus_hab": 400.0},
    }


def test_recorte_municipal_omite_municipio_sem_dado_em_nenhum_ano():
    anos = [siops.AnoSiops(2025, "x", {"4100103": {"populacao": 1.0, "despesa_saude_hab": None,
                                                    "pct_receita_propria": None, "transf_sus_hab": None}})]
    assert siops.recorte_municipal(anos, 2025) == {}


def test_montar_saida_ordena_anos_e_expoe_indicadores():
    saida = siops.montar_saida(_anos(), "2026-09-13")
    assert list(saida) == ["metadata", "indicadores", "porAno", "porMunicipio", "anoReferencia"]
    assert saida["anoReferencia"] == 2025
    assert saida["metadata"]["periodo"] == "2024-2025"
    assert [i["codigo"] for i in saida["indicadores"]] == [
        "despesa_saude_hab", "pct_receita_propria", "transf_sus_hab"]
    assert saida["porAno"] == [
        {"ano": 2024, "despesa_saude_hab": 1269.23, "pct_receita_propria": 19.08, "transf_sus_hab": 453.85},
        {"ano": 2025, "despesa_saude_hab": 2000.0, "pct_receita_propria": 25.0, "transf_sus_hab": 600.0},
    ]
    assert chr(8212) not in json.dumps(saida, ensure_ascii=False)  # sem travessão nos textos


def test_executar_usa_o_servidor_do_siops_e_grava_tudo(tmp_path, monkeypatch):
    chamadas = []

    def consultar_falso(def_path, campos, servidor=tabnet.TABNET, http=None):
        chamadas.append((def_path, campos["Arquivos"], campos["SUF"], servidor.host))
        return CSVS[campos["Arquivos"]]

    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "public")
    monkeypatch.setattr(common, "sessao", lambda: None)
    monkeypatch.setattr(common, "cod6_para_7", lambda: MAPA)
    monkeypatch.setattr(tabnet, "baixar_formulario",
                        lambda def_path, servidor=None, http=None: FORM_HTML)
    monkeypatch.setattr(tabnet, "consultar", consultar_falso)
    monkeypatch.setattr(tabnet, "MINIMO_MUNICIPIOS_PR", 1)  # fixture com poucos municípios

    manifesto = siops.executar({})

    assert chamadas == [
        ("SIOPS/serhist/municipio/mIndicadores.def", "indmun24.dbf", "21", "http://siops-asp.datasus.gov.br"),
        ("SIOPS/serhist/municipio/mIndicadores.def", "indmun25.dbf", "21", "http://siops-asp.datasus.gov.br"),
    ]
    assert set(manifesto) == {"tabnet/siops_2024.csv", "tabnet/siops_2025.csv"}
    assert manifesto["tabnet/siops_2024.csv"]["linhas"] == 3
    assert manifesto["tabnet/siops_2025.csv"]["url"].startswith("http://siops-asp.datasus.gov.br/CGI/tabcgi.exe?")
    bruto = (tmp_path / "raw" / "tabnet" / "siops_2025.csv").read_text(encoding="utf-8")
    assert '"410010 Abatiá"' in bruto and "Saúde" in bruto

    saida = json.loads((tmp_path / "public" / siops.SAIDA).read_text(encoding="utf-8"))
    assert saida["anoReferencia"] == 2025
    assert saida["porMunicipio"]["4128807"]["ano"] == 2024
    assert saida["metadata"]["atualizacao"] == manifesto["tabnet/siops_2025.csv"]["alterado_em"]
