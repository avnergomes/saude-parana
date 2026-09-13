"""Testes do ETL de cobertura da APS (sem rede: fixtures inline no formato da API).

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from datetime import date
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import aps, common  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

GEO = {
    "4100103": {"nome": "Abatiá", "regional": "Cornélio Procópio"},
    "4101051": {"nome": "Anahy", "regional": "Cascavel"},
    "4106902": {"nome": "Curitiba", "regional": "Curitiba"},
}
COD6 = {cod[:6]: cod for cod in GEO}


def registro(comp, cod6, nome, pop, cobertura, esf=1, eap20=0, eap30=0, capacidade=0):
    """Registro mínimo no formato do relatorioaps-prd."""
    return {
        "nuComp": comp, "coMunicipioIbge": cod6, "noMunicipioAcentuado": nome,
        "qtPopulacao": pop, "qtEsf": esf, "qtEap20": eap20, "qtEap30": eap30,
        "qtCapacidadeEquipe": capacidade, "qtCobertura": cobertura,
    }


REGISTROS_2025 = [
    registro("11/2025", "410010", "ABATIÁ", 7000, 133.07, esf=2, eap30=1, capacidade=9625),
    registro("11/2025", "410690", "CURITIBA", 1800000, 60.0, esf=180, eap20=100, eap30=140),
    registro("12/2025", "410010", "ABATIÁ", 7000, 95.5, esf=2, eap30=1, capacidade=9625),
    registro("12/2025", "410690", "CURITIBA", 1800000, 61.0, esf=181, eap20=100, eap30=140),
    registro("12/2025", "410105", "ANAHY", 3000, None, esf=1),
]
REGISTROS_2026 = [
    registro("01/2026", "410010", "ABATIÁ", 7000, 100.0, esf=2, eap30=1, capacidade=9625),
    registro("01/2026", "410690", "CURITIBA", 1800000, 62.5, esf=182, eap20=100, eap30=140),
    registro("01/2026", "999999", "OUTRO", 1, 50.0),
]
CFG = aps.ConfigAps(ano_inicio=2025)


def test_competencia_iso_e_limite_de_cobertura():
    assert aps.competencia_iso("07/2026") == "2026-07"
    assert aps.competencia_iso(" 1/2021 ") == "2021-01"
    assert aps.cobertura_limitada(133.07, 100.0) == 100.0
    assert aps.cobertura_limitada(61.44, 100.0) == 61.4
    assert aps.cobertura_limitada(None, 100.0) is None


def test_anos_e_meses_vai_do_inicio_ate_o_mes_atual():
    assert aps.anos_e_meses(aps.ConfigAps(ano_inicio=2024), date(2026, 9, 13)) == [
        (2024, 12), (2025, 12), (2026, 9),
    ]


def test_normalizar_limita_100_soma_eap_e_descarta():
    por_comp, descartados = aps.normalizar(REGISTROS_2025 + REGISTROS_2026, COD6, 100.0)
    assert sorted(por_comp) == ["2025-11", "2025-12", "2026-01"]
    assert por_comp["2025-11"]["4100103"] == {
        "cobertura": 100.0, "esf": 2, "eap": 1, "capacidade": 9625, "populacao": 7000,
    }
    assert por_comp["2025-11"]["4106902"]["eap"] == 240
    assert por_comp["2025-12"]["4101051"]["cobertura"] is None
    assert descartados == {"codigosNaoMapeados": ["999999"],
                           "semCobertura": ["2025-12:4101051"]}
    # A entrada não é mutada
    assert REGISTROS_2025[0]["qtCobertura"] == 133.07


def test_cobertura_ponderada_ignora_municipios_sem_cobertura():
    por_comp, _ = aps.normalizar(REGISTROS_2025, COD6, 100.0)
    # (95,5% x 7000 + 61% x 1.800.000) / 1.807.000 = 61,13% (Anahy, sem cobertura, fica de fora)
    assert aps.cobertura_ponderada(por_comp["2025-12"]) == 61.1
    assert aps.cobertura_ponderada({}) is None


def test_build_por_mes_em_ordem_cronologica():
    por_comp, _ = aps.normalizar(REGISTROS_2025 + REGISTROS_2026, COD6, 100.0)
    serie = aps.build_por_mes(por_comp)
    assert [s["competencia"] for s in serie] == ["2025-11", "2025-12", "2026-01"]
    assert serie[1] == {"competencia": "2025-12", "cobertura": 61.1, "esf": 184,
                        "populacao": 1810000}


def test_build_por_municipio_preenche_ausentes_com_nulos():
    por_comp, _ = aps.normalizar(REGISTROS_2026, COD6, 100.0)
    out = aps.build_por_municipio(por_comp, "2026-01", list(GEO))
    assert list(out) == ["4100103", "4101051", "4106902"]
    assert out["4101051"] == aps.VAZIO
    assert out["4101051"] is not aps.VAZIO
    assert out["4106902"]["cobertura"] == 62.5


def test_build_por_municipio_ano_usa_ultimo_valor_nao_nulo_do_ano():
    por_comp, _ = aps.normalizar(REGISTROS_2025 + REGISTROS_2026, COD6, 100.0)
    out = aps.build_por_municipio_ano(por_comp)
    assert out["4100103"] == {"2025": 95.5, "2026": 100.0}
    assert out["4106902"] == {"2025": 61.0, "2026": 62.5}
    assert out["4101051"] == {"2025": None}


def test_baixar_ano_converte_falhas_em_fonte_indisponivel():
    class HttpFalha:
        def get(self, url, timeout):
            raise requests.ConnectionError("sem rede")

    class Resposta:
        status_code = 200
        content = json.dumps({"erro": "x"}).encode("utf-8")

        def raise_for_status(self):
            pass

    class HttpDict:
        def get(self, url, timeout):
            return Resposta()

    with pytest.raises(FonteIndisponivel):
        aps.baixar_ano(HttpFalha(), CFG, 2026, 1)
    with pytest.raises(FonteIndisponivel):
        aps.baixar_ano(HttpDict(), CFG, 2026, 1)


def test_executar_grava_saida_brutos_e_manifesto(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "public")
    monkeypatch.setattr(common, "geo_municipios", lambda: GEO)
    monkeypatch.setattr(common, "cod6_para_7", lambda: COD6)
    por_ano = {2025: REGISTROS_2025, 2026: REGISTROS_2026}
    monkeypatch.setattr(
        aps, "baixar_ano",
        lambda http, cfg, ano, mes: (json.dumps(por_ano[ano], ensure_ascii=False), por_ano[ano]))

    manifesto_inicial = {}
    manifesto = aps.executar(manifesto_inicial, CFG, hoje=date(2026, 1, 20))

    assert manifesto_inicial == {}
    assert sorted(manifesto) == ["aps/cobertura_2025.json", "aps/cobertura_2026.json"]
    assert manifesto["aps/cobertura_2025.json"]["linhas"] == 5
    # Só o hash entra no manifesto (brutos de ~2,7 MB/ano não são versionados)
    assert len(manifesto["aps/cobertura_2025.json"]["sha256"]) == 64
    assert not (tmp_path / "raw" / "aps" / "cobertura_2025.json").exists()

    saida = json.loads((tmp_path / "public" / aps.SAIDA).read_text(encoding="utf-8"))
    assert list(saida) == ["metadata", "porMes", "porMunicipio", "porMunicipioAno"]
    assert saida["metadata"]["competencia"] == "2026-01"
    assert saida["metadata"]["periodo"] == "2025-11..2026-01"
    assert saida["metadata"]["descartados"] == {
        "codigosNaoMapeados": ["999999"], "semCobertura": ["2025-12:4101051"],
        "municipiosAusentesNaCompetencia": {"4101051": "Anahy"},
    }
    assert saida["porMes"][-1]["esf"] == 184
    assert saida["porMunicipio"]["4101051"]["cobertura"] is None
    assert saida["porMunicipioAno"]["4100103"] == {"2025": 95.5, "2026": 100.0}
