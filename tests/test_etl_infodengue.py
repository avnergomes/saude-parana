"""Testes do ETL de arboviroses (InfoDengue), sem rede: fixtures inline no formato da API.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import common, infodengue as idg  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

GEO = {
    "4100103": {"nome": "Abatiá", "regional": "Cornélio Procópio"},
    "4101051": {"nome": "Anahy", "regional": "Cascavel"},
    "4106902": {"nome": "Curitiba", "regional": "Curitiba"},
}
SE_202401 = 1703980800000  # 2023-12-31 UTC
SE_202552 = 1766361600000  # 2025-12-21 UTC
SE_202601 = 1766966400000  # 2025-12-28 UTC


def reg(se, casos, casos_est, nivel, pop, inicio):
    """Registro mínimo no formato do alertcity (a API devolve em ordem decrescente)."""
    return {"data_iniSE": inicio, "SE": se, "casos_est": casos_est, "casos": casos,
            "nivel": nivel, "pop": pop, "municipio_nome": "x"}


CURITIBA = [
    reg(202601, 10, 12.0, 1, "1000000", SE_202601),
    reg(202552, 20, 20.0, 2, "1000000", SE_202552),
    reg(202401, 90, 95.5, 3, "1000000", SE_202401),
    reg(202352, 999, 999.0, 4, "1000000", 0),  # fora do período
]
ABATIA = [
    reg(202601, 0, 0.0, 1, "10000", SE_202601),
    reg(202552, 5, 5.0, 4, "10000", SE_202552),
    reg(202401, 11, 11.4, 2, "10000", SE_202401),
]
BRUTO = {"4106902": CURITIBA, "4100103": ABATIA}
CFG = idg.ConfigInfodengue(pausa=0.0)


def test_data_iso_converte_epoch_ms_em_utc():
    assert idg.data_iso(SE_202401) == "2023-12-31"
    assert idg.data_iso(None) is None


def test_filtrar_corta_anos_anteriores_e_ordena_por_se():
    filtrado = idg.filtrar(BRUTO, 2024)
    assert list(filtrado) == ["4100103", "4106902"]
    assert [r["SE"] for r in filtrado["4106902"]] == [202401, 202552, 202601]
    # A entrada continua em ordem decrescente (não mutada)
    assert [r["SE"] for r in CURITIBA] == [202601, 202552, 202401, 202352]


def test_build_por_semana_soma_estado_e_conta_municipios_em_alerta():
    serie = idg.build_por_semana(idg.filtrar(BRUTO, 2024), nivel_alerta=3)
    assert [s["semana"] for s in serie] == ["202401", "202552", "202601"]
    assert serie[0] == {"semana": "202401", "inicio": "2023-12-31", "casos_est": 107,
                        "casos": 101, "municipiosAlerta": 1}
    assert serie[1]["municipiosAlerta"] == 1  # Abatiá nível 4
    assert serie[2]["municipiosAlerta"] == 0


def test_build_por_ano_usa_soma_das_populacoes():
    serie = idg.build_por_ano(idg.filtrar(BRUTO, 2024))
    # 2024: 101 casos / 1.010.000 hab = 10,0 por 100 mil
    assert serie[0] == {"ano": 2024, "casos": 101, "casos_est": 107, "incidencia_100k": 10.0}
    assert [s["ano"] for s in serie] == [2024, 2025, 2026]
    assert serie[2]["casos"] == 10


def test_build_por_municipio_no_ano_de_referencia_com_nivel_da_ultima_semana():
    out = idg.build_por_municipio(idg.filtrar(BRUTO, 2024), 2026)
    assert out["4106902"] == {"casos_ano": 10, "casos_est_ano": 12, "incidencia_100k": 1.0,
                              "nivel": 1, "pop": 1000000}
    assert out["4100103"]["casos_ano"] == 0
    assert out["4100103"]["incidencia_100k"] == 0.0


def test_build_por_municipio_ano():
    out = idg.build_por_municipio_ano(idg.filtrar(BRUTO, 2024))
    assert out == {"4100103": {"2024": 11, "2025": 5, "2026": 0},
                   "4106902": {"2024": 90, "2025": 20, "2026": 10}}


def test_processar_doenca_define_periodo_e_ano_de_referencia():
    r = idg.processar_doenca(BRUTO, CFG)
    assert r["periodo"] == "2024-01..2026-01"
    assert r["semanaUltima"] == "202601"
    assert r["anoReferencia"] == 2026
    with pytest.raises(FonteIndisponivel):
        idg.processar_doenca({"4106902": []}, CFG)


def test_montar_saida_so_aninha_outras_doencas_quando_configuradas():
    r = idg.processar_doenca(BRUTO, CFG)
    saida = idg.montar_saida({"dengue": r}, {"dengue": ["4101051"]}, CFG, "2026-09-13")
    assert list(saida) == ["metadata", "porSemana", "porAno", "porMunicipio",
                           "porMunicipioAno", "anoReferencia"]
    assert saida["metadata"]["doencas"] == ["dengue"]
    assert saida["metadata"]["descartados"] == {"municipiosSemResposta": ["4101051"]}

    cfg2 = idg.ConfigInfodengue(doencas=("dengue", "chikungunya"), pausa=0.0)
    saida2 = idg.montar_saida({"dengue": r, "chikungunya": r},
                              {"dengue": [], "chikungunya": ["4100103"]}, cfg2, "2026-09-13")
    assert saida2["outrasDoencas"]["chikungunya"]["descartados"] == {
        "municipiosSemResposta": ["4100103"]}


def test_baixar_doenca_tolera_falhas_ate_o_limite_e_aborta_acima(monkeypatch):
    monkeypatch.setattr(idg.time, "sleep", lambda s: None)
    respostas = {"4100103": ABATIA, "4106902": CURITIBA}
    monkeypatch.setattr(idg, "baixar_municipio",
                        lambda http, cfg, cod, doenca, ano: respostas.get(cod))
    cfg = idg.ConfigInfodengue(tolerancia_falhas=0.5, pausa=0.0)  # 3 municípios -> 1 falha
    dados, falhas = idg.baixar_doenca(None, cfg, "dengue", list(GEO), 2026)
    assert sorted(dados) == ["4100103", "4106902"]
    assert falhas == ["4101051"]

    cfg_rigida = idg.ConfigInfodengue(tolerancia_falhas=0.0, pausa=0.0)
    with pytest.raises(FonteIndisponivel):
        idg.baixar_doenca(None, cfg_rigida, "dengue", list(GEO), 2026)


def test_registrar_bruto_so_guarda_hash_acima_do_limite(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    pequeno = idg.ConfigInfodengue(limite_persistencia=10 * 1024 * 1024)
    m1, arquivo = idg.registrar_bruto({}, pequeno, "dengue", BRUTO, "http://x")
    assert arquivo == "infodengue/dengue_pr.json"
    assert (tmp_path / arquivo).exists()
    assert m1[arquivo]["linhas"] == 7

    grande = idg.ConfigInfodengue(limite_persistencia=10)
    m2, _ = idg.registrar_bruto({}, grande, "chikungunya", BRUTO, "http://x")
    assert not (tmp_path / "infodengue" / "chikungunya_pr.json").exists()
    assert m2["infodengue/chikungunya_pr.json"]["sha256"] == m1[arquivo]["sha256"]


def test_executar_grava_saida_e_registra_municipios_sem_resposta(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "public")
    monkeypatch.setattr(common, "geo_municipios", lambda: GEO)
    monkeypatch.setattr(idg.time, "sleep", lambda s: None)
    monkeypatch.setattr(idg, "baixar_municipio",
                        lambda http, cfg, cod, doenca, ano: BRUTO.get(cod))

    # 3 municípios: 5% de tolerância arredonda para zero; aqui 1 falha em 3 deve ser aceita
    cfg = idg.ConfigInfodengue(pausa=0.0, tolerancia_falhas=0.5)
    manifesto_inicial = {}
    manifesto = idg.executar(manifesto_inicial, cfg, hoje=date(2026, 9, 13))

    assert manifesto_inicial == {}
    assert list(manifesto) == ["infodengue/dengue_pr.json"]
    bruto = json.loads((tmp_path / "raw" / "infodengue" / "dengue_pr.json")
                       .read_text(encoding="utf-8"))
    assert sorted(bruto) == ["4100103", "4106902"]

    saida = json.loads((tmp_path / "public" / idg.SAIDA).read_text(encoding="utf-8"))
    assert saida["metadata"]["descartados"] == {"municipiosSemResposta": ["4101051"]}
    assert saida["metadata"]["semanaUltima"] == "202601"
    assert saida["anoReferencia"] == 2026
    assert saida["porAno"][0]["casos"] == 101
    assert saida["porMunicipio"]["4106902"]["nivel"] == 1
