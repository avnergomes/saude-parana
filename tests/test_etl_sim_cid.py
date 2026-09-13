"""Testes do ETL SIM por capítulo CID-10 (scripts/etl/sim_cid.py), sem rede.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import common, sim_cid, tabnet  # noqa: E402

FORM_HTML = """<html><body><FORM ACTION="/cgi/tabcgi.exe?sim/cnv/obt10pr.def" METHOD=POST>
<SELECT NAME="Arquivos" ID="A" SIZE=4 MULTIPLE>
<OPTION VALUE="obtpr25.dbf" SELECTED >2025
<OPTION VALUE="obtpr24.dbf">2024
<OPTION VALUE="obtpr23.dbf">2023
<OPTION VALUE="obtpr96.dbf">1996
</SELECT></FORM></body></html>"""

RODAPE = (
    " Fonte: MS/SVSA/CGIAE - Sistema de Informações sobre Mortalidade - SIM\n"
    " Notas:\n"
    " Dados finais disponíveis até 2024 - data de extração 02/12/2025.\n"
    " Dados de 2025 - Preliminares - data de extração 28/07/2026.\n"
)

CSVS = {
    "obtpr23.dbf": (
        " Mortalidade - Paraná\nÓbitos p/Residênc por Município e Capítulo CID-10\nPeríodo:2023\n"
        '"Município";"Cap I";"Cap II";"Cap XXI";"Total"\n'
        '"410010 ABATIA";4;10;1;15\n'
        '"410020 ADRIANOPOLIS";2;8;-;10\n'
        '"Total";6;18;1;25\n' + RODAPE
    ),
    "obtpr24.dbf": (
        " Mortalidade - Paraná\nÓbitos p/Residênc por Município e Capítulo CID-10\nPeríodo:2024\n"
        '"Município";"Cap I";"Cap II";"Cap XX";"Total"\n'
        '" MUNICIPIO IGNORADO - PR";1;3;45;49\n'
        '"410010 ABATIA";5;13;7;25\n'
        '"410020 ADRIANOPOLIS";-;10;8;18\n'
        '"Total";6;26;60;92\n' + RODAPE
    ),
    "obtpr25.dbf": (
        " Mortalidade - Paraná\nÓbitos p/Residênc por Município e Capítulo CID-10\nPeríodo:2025\n"
        '"Município";"Cap I";"Cap II";"Total"\n'
        '"410010 ABATIA";3;9;12\n'
        '"410020 ADRIANOPOLIS";1;7;8\n'
        '"Total";4;16;20\n' + RODAPE
    ),
}
MAPA = {"410010": "4100103", "410020": "4100202"}


def test_anos_disponiveis_le_arquivos_a_partir_do_ano_inicial():
    assert sim_cid.anos_disponiveis(FORM_HTML) == {
        2023: "obtpr23.dbf", 2024: "obtpr24.dbf", 2025: "obtpr25.dbf",
    }
    cfg = sim_cid.ConfigSim(ano_inicial=1996)
    assert 1996 in sim_cid.anos_disponiveis(FORM_HTML, cfg)
    with pytest.raises(common.FonteIndisponivel):
        sim_cid.anos_disponiveis("<select name=\"Arquivos\"></select>")


def test_campos_usam_os_valores_exatos_do_formulario():
    assert sim_cid.campos("obtpr24.dbf") == {
        "Linha": "Município", "Coluna": "Capítulo_CID-10", "Incremento": "Óbitos_p/Residênc",
        "Arquivos": "obtpr24.dbf", "formato": "table", "mostre": "Mostra",
    }


def test_ano_final_le_a_nota_do_rodape_ou_usa_o_padrao():
    assert sim_cid.ano_final(CSVS["obtpr24.dbf"]) == 2024
    assert sim_cid.ano_final("sem nota") == sim_cid.CONFIG.ultimo_ano_final
    assert sim_cid.ano_final("sem nota", sim_cid.ConfigSim(ultimo_ano_final=2030)) == 2030


def _ano(ano, arquivo, ano_final=2024):
    tabela = tabnet.tabela_capitulos(tabnet.parse_csv(CSVS[arquivo]), MAPA)
    return sim_cid.AnoSim(ano, f"tabnet/sim_{ano}.csv", tabela, ano_final)


def test_montar_saida_soma_municipios_e_separa_preliminares():
    anos = [_ano(2023, "obtpr23.dbf"), _ano(2024, "obtpr24.dbf"), _ano(2025, "obtpr25.dbf")]
    saida = sim_cid.montar_saida(anos, "2026-09-13")

    assert [c["codigo"] for c in saida["capitulos"]] == ["I", "II", "XX", "XXI"]
    assert saida["anoReferencia"] == 2024
    assert saida["metadata"]["preliminares"] == [2025]
    assert saida["metadata"]["periodo"] == "2023-2025"
    assert saida["metadata"]["atualizacao"] == "2026-09-13"
    # Soma só dos municípios mapeados (exclui "MUNICIPIO IGNORADO"); "-" conta 0
    assert saida["porAno"] == [
        {"ano": 2023, "total": 25, "I": 6, "II": 18, "XX": 0, "XXI": 1},
        {"ano": 2024, "total": 43, "I": 5, "II": 23, "XX": 15, "XXI": 0},
        {"ano": 2025, "total": 20, "I": 4, "II": 16, "XX": 0, "XXI": 0},
    ]
    assert saida["porMunicipio"] == {
        "4100103": {"total": 25, "I": 5, "II": 13, "XX": 7, "XXI": 0},
        "4100202": {"total": 18, "I": 0, "II": 10, "XX": 8, "XXI": 0},
    }


def test_montar_saida_sem_ano_final_disponivel_usa_o_mais_recente():
    saida = sim_cid.montar_saida([_ano(2025, "obtpr25.dbf", ano_final=2024)], "2026-01-01")
    assert saida["anoReferencia"] == 2025
    assert saida["metadata"]["preliminares"] == []


def test_executar_grava_saida_brutos_e_manifesto(tmp_path, monkeypatch):
    chamadas = []

    def consultar_falso(def_path, campos, servidor=tabnet.TABNET, http=None):
        chamadas.append((def_path, campos["Arquivos"]))
        return CSVS[campos["Arquivos"]]

    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "public")
    monkeypatch.setattr(common, "sessao", lambda: None)
    monkeypatch.setattr(common, "cod6_para_7", lambda: MAPA)
    monkeypatch.setattr(tabnet, "baixar_formulario", lambda def_path, servidor=None, http=None: FORM_HTML)
    monkeypatch.setattr(tabnet, "consultar", consultar_falso)

    manifesto_inicial = {"outro.json": {"sha256": "x", "alterado_em": "2020-01-01"}}
    manifesto = sim_cid.executar(manifesto_inicial)

    assert chamadas == [("sim/cnv/obt10pr.def", "obtpr23.dbf"), ("sim/cnv/obt10pr.def", "obtpr24.dbf"),
                        ("sim/cnv/obt10pr.def", "obtpr25.dbf")]
    assert manifesto_inicial == {"outro.json": {"sha256": "x", "alterado_em": "2020-01-01"}}
    assert set(manifesto) == {"outro.json", "tabnet/sim_2023.csv", "tabnet/sim_2024.csv", "tabnet/sim_2025.csv"}
    assert manifesto["tabnet/sim_2024.csv"]["linhas"] == 3
    assert manifesto["tabnet/sim_2024.csv"]["url"] == "http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sim/cnv/obt10pr.def"

    bruto = (tmp_path / "raw" / "tabnet" / "sim_2024.csv").read_text(encoding="utf-8")
    assert '"Município";"Cap I"' in bruto and "Óbitos p/Residênc" in bruto

    saida = json.loads((tmp_path / "public" / sim_cid.SAIDA).read_text(encoding="utf-8"))
    assert list(saida) == ["metadata", "capitulos", "porAno", "porMunicipio", "anoReferencia"]
    assert saida["anoReferencia"] == 2024
    assert saida["metadata"]["atualizacao"] == manifesto["tabnet/sim_2024.csv"]["alterado_em"]
    assert saida["porMunicipio"]["4100103"]["total"] == 25
    assert chr(8212) not in json.dumps(saida, ensure_ascii=False)  # sem travessão nos textos
