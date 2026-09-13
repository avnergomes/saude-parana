"""Testes do ETL de planos de saúde (ANS PDA 047), sem rede: CSV inline.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import ans, common  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

GEO = {
    "4100103": {"nome": "Abatiá", "regional": "Cornélio Procópio"},
    "4106902": {"nome": "Curitiba", "regional": "Curitiba"},
}
COD6 = {cod[:6]: cod for cod in GEO}
CABECALHO = ("PERIODO;CD_MUNICIPIO;NM_MUNICIPIO;CD_UF;SG_UF;CD_RM;NM_RM;SEXO;FAIXA_ETARIA;"
             "BENEF_ASSISTENCIA_MEDICA;BENEF_EXCLUS_ODONTOLOGICO;BENEF_TOTAL;POPULACAO;"
             "TX_COBERT_ASSISTENCIA_MEDICA;TX_COBERT_EXCLUSIVAMENTE_ODONTOLOGICO;TX_COBERT_TOTAL")


def linha(periodo, cod, nome, uf, sexo, faixa, medico, odonto, pop="0"):
    cd_uf = "41" if uf == "PR" else "42"
    return (f'"{periodo}";"{cod}";"{nome}";"{cd_uf}";"{uf}";"00000";'
            f'"Fora Da Região Metropolitana";"{sexo}";"{faixa}";"{medico}";"{odonto}";'
            f'"{medico + odonto}";"{pop}";0,0000;0,0000;0,0000')


LINHAS_PR = [
    linha("2026", "410010", "Abatiá", "PR", "FEMININO", "Até 1 ano", 10, 5),
    linha("2026", "410010", "Abatiá", "PR", "MASCULINO", "1 a 4 anos", 20, 5),
    linha("2026", "410690", "Curitiba", "PR", "FEMININO", "Inconsistente", 100, 50),
    linha("2026", "410000", "Município Ignorado", "PR", "FEMININO", "Até 1 ano", 3, 0),
    linha("2025", "410010", "Abatiá", "PR", "FEMININO", "Até 1 ano", 8, 2),
    linha("2026", "410010", "Abatiá", "PR", "TOTAL", "TOTAL", 999, 999),
]
LINHA_SC = linha("2026", "420010", "Abelardo Luz", "SC", "FEMININO", "Até 1 ano", 7, 1)
CSV_PR = "\n".join([CABECALHO] + LINHAS_PR) + "\n"
CFG = ans.ConfigAns()


def test_filtrar_uf_mantem_cabecalho_e_linhas_verbatim_da_uf():
    entrada = [CABECALHO + "\r\n", LINHA_SC + "\r\n"] + [l + "\r\n" for l in LINHAS_PR]
    assert ans.filtrar_uf(entrada, CFG) == CSV_PR
    with pytest.raises(FonteIndisponivel):
        ans.filtrar_uf(["PERIODO;CD_MUNICIPIO\n", '"2026";"410010"\n'], CFG)


def test_decodificacao_iso_8859_1_preserva_acentos():
    bruto = (CABECALHO + "\n" + linha("2026", "410090", "Amaporã", "PR", "FEMININO",
                                      "Até 1 ano", 1, 0) + "\n").encode("iso-8859-1")
    linhas = (b.decode(CFG.codificacao) for b in bruto.splitlines())
    assert "Amaporã" in ans.filtrar_uf(linhas, CFG)


def test_numero_inteiro_e_periodo():
    assert ans.numero("12,5") == 12.5
    assert ans.numero("") == 0.0
    assert ans.inteiro("63842") == 63842
    assert ans.normalizar_periodo("2026") == "2026"
    assert ans.normalizar_periodo("202612") == "2026-12"
    assert ans.normalizar_periodo("7/2026") == "2026-07"
    assert ans.ano_do_periodo("2026-07") == 2026


def test_agregar_soma_sexo_x_faixa_sem_duplicar_totais():
    por_periodo, descartados = ans.agregar(CSV_PR, COD6, CFG)
    assert sorted(por_periodo) == ["2025", "2026"]
    assert por_periodo["2026"]["4100103"] == {
        "beneficiarios": 40, "beneficiarios_medico": 30,
        "beneficiarios_odonto": 10, "populacao_ans": 0,
    }
    assert por_periodo["2026"]["4106902"]["beneficiarios"] == 150  # faixa 'Inconsistente' conta
    assert por_periodo["2025"]["4100103"]["beneficiarios"] == 10
    assert descartados == {"codigosNaoMapeados": {"410000": 3}, "linhasDeTotalIgnoradas": 1}


def test_anexar_populacao_usa_o_ano_do_periodo_sem_mutar_a_entrada():
    por_periodo, _ = ans.agregar(CSV_PR, COD6, CFG)
    chamadas = []

    def populacao(cod, ano):
        chamadas.append((cod, ano))
        return {"4100103": 8000, "4106902": 1800000}[cod] + ano - 2026

    com_pop = ans.anexar_populacao(por_periodo, populacao)
    assert com_pop["2026"]["4100103"]["populacao"] == 8000
    assert com_pop["2025"]["4100103"]["populacao"] == 7999
    assert ("4106902", 2026) in chamadas
    assert "populacao" not in por_periodo["2026"]["4100103"]


def test_series_e_recortes():
    por_periodo, _ = ans.agregar(CSV_PR, COD6, CFG)
    pop = {"4100103": 5000, "4106902": 1500000}
    com_pop = ans.anexar_populacao(por_periodo, lambda cod, ano: pop[cod])

    serie = ans.build_por_periodo(com_pop)
    assert serie[0] == {"periodo": "2025", "beneficiarios": 10, "taxa_cobertura": 0.2,
                        "taxa_medico": 0.16}
    assert serie[1]["beneficiarios"] == 190
    assert serie[1]["taxa_cobertura"] == round(190 / 1505000 * 100, 2)

    municipios = ans.build_por_municipio(com_pop["2026"])
    assert list(municipios) == ["4100103", "4106902"]
    assert municipios["4100103"] == {"beneficiarios": 40, "beneficiarios_medico": 30,
                                     "populacao": 5000, "taxa_cobertura": 0.8, "taxa_medico": 0.6}

    assert ans.build_por_municipio_ano(com_pop) == {
        "4100103": {"2025": 0.2, "2026": 0.8},
        "4106902": {"2026": 0.01},
    }


def test_taxa_sem_populacao_fica_nula():
    assert ans.build_por_municipio({"x": {"beneficiarios": 5, "beneficiarios_medico": 1,
                                          "populacao": None}})["x"]["taxa_cobertura"] is None


def test_executar_grava_saida_bruto_utf8_e_manifesto(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "public")
    monkeypatch.setattr(common, "cod6_para_7", lambda: COD6)
    monkeypatch.setattr(common, "populacao_municipal", lambda: {})
    monkeypatch.setattr(common, "populacao_de",
                        lambda pop, cod, ano: {"4100103": 5000, "4106902": 1500000}[cod])
    monkeypatch.setattr(ans, "baixar_subconjunto_uf", lambda http, cfg: CSV_PR)

    manifesto_inicial = {}
    manifesto = ans.executar(manifesto_inicial, CFG)

    assert manifesto_inicial == {}
    assert manifesto["ans/pda047_pr.csv"]["linhas"] == 6
    bruto = (tmp_path / "raw" / "ans" / "pda047_pr.csv").read_bytes()
    assert "Abatiá".encode("utf-8") in bruto

    saida = json.loads((tmp_path / "public" / ans.SAIDA).read_text(encoding="utf-8"))
    assert list(saida) == ["metadata", "porPeriodo", "porMunicipio", "porMunicipioAno"]
    assert saida["metadata"]["competencia"] == "2026"
    assert saida["metadata"]["periodo"] == "2025..2026"
    assert saida["metadata"]["descartados"]["codigosNaoMapeados"] == {"410000": 3}
    assert saida["porPeriodo"][-1]["beneficiarios"] == 190
    assert saida["porMunicipio"]["4106902"]["beneficiarios_medico"] == 100
    assert saida["porMunicipioAno"]["4100103"] == {"2025": 0.2, "2026": 0.8}
