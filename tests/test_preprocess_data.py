"""Testes das funções puras do preprocess (sem I/O nem rede).

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import preprocess_data as pp  # noqa: E402


def sidra(cod, nome, ano, valor, **extra):
    """Linha mínima no formato da API SIDRA (n6)."""
    return {"D1C": cod, "D1N": nome, "D3N": str(ano), "V": str(valor), **extra}


def test_parse_valor_trata_ausentes_do_sidra():
    assert pp.parse_valor("-") is None
    assert pp.parse_valor("...") is None
    assert pp.parse_valor("X") is None
    assert pp.parse_valor("") is None
    assert pp.parse_valor(None) is None
    assert pp.parse_valor("12") == 12
    assert pp.parse_valor("12.0") == 12
    assert pp.parse_valor("abc") is None


def test_build_populacao_mescla_estimativas_e_censos():
    estimativas = [
        sidra("4100103", "Abatiá - PR", 2021, 7300),
        sidra("4100103", "Abatiá - PR", 2024, 7200),
    ]
    censo = [sidra("4100103", "Abatiá - PR", 2022, 7241)]
    pop = pp.build_populacao([estimativas, censo])
    assert pop == {"4100103": {2021: 7300, 2022: 7241, 2024: 7200}}


def test_populacao_de_usa_ano_oficial_quando_existe():
    pop = {"41": {2021: 100, 2024: 130}}
    assert pp.populacao_de(pop, "41", 2021) == (100, False)


def test_populacao_de_interpola_entre_vizinhos():
    pop = {"41": {2022: 100, 2024: 130}}
    assert pp.populacao_de(pop, "41", 2023) == (115, True)


def test_populacao_de_fora_do_intervalo_usa_mais_proximo():
    pop = {"41": {2003: 100, 2005: 120}}
    assert pp.populacao_de(pop, "41", 2001) == (100, True)
    assert pp.populacao_de(pop, "41", 2030) == (120, True)
    assert pp.populacao_de(pop, "99", 2001) == (None, False)


def test_build_obitos_e_anexar_populacao_marcam_interpolados():
    rows = [
        sidra("4100103", "Abatiá - PR", 2022, 50),
        sidra("4100103", "Abatiá - PR", 2023, 60),
        sidra("4100103", "Abatiá - PR", 2024, "-"),
    ]
    por_mun, nomes, anos = pp.build_obitos(rows)
    assert nomes == {"4100103": "Abatiá"}
    assert anos == [2022, 2023]

    pop = {"4100103": {2022: 1000, 2024: 1200}}
    com_pop, interpolados = pp.anexar_populacao(por_mun, pop)
    assert com_pop["4100103"][2022] == {"obitos": 50, "populacao": 1000}
    assert com_pop["4100103"][2023] == {"obitos": 60, "populacao": 1100}
    assert interpolados == {2023}
    # O dicionário original não é mutado
    assert por_mun["4100103"][2022] == {"obitos": 50}


def test_build_por_ano_usa_populacao_do_proprio_ano():
    por_mun = {
        "a": {2023: {"obitos": 10, "populacao": 1000}, 2024: {"obitos": 12, "populacao": 2000}},
        "b": {2023: {"obitos": 5, "populacao": 500}},
    }
    serie = pp.build_por_ano(por_mun, [2023, 2024])
    assert serie == [
        {"ano": 2023, "total": 15, "taxa_bruta": 10.0},
        {"ano": 2024, "total": 12, "taxa_bruta": 6.0},
    ]


def test_build_por_ano_ignora_municipio_sem_populacao_na_taxa():
    por_mun = {
        "a": {2024: {"obitos": 10, "populacao": 1000}},
        "b": {2024: {"obitos": 50, "populacao": None}},
    }
    serie = pp.build_por_ano(por_mun, [2024])
    # Total conta os dois; a taxa usa só "a" (10/1000), sem inflar com "b"
    assert serie == [{"ano": 2024, "total": 60, "taxa_bruta": 10.0}]


def test_data_atualizacao_vem_do_manifesto(tmp_path, monkeypatch):
    manifesto = tmp_path / "_manifest.json"
    monkeypatch.setattr(pp, "MANIFEST_PATH", manifesto)
    assert pp.data_atualizacao() == pp.date.today().isoformat()

    manifesto.write_text(json.dumps({
        "a.json": {"alterado_em": "2026-06-11"},
        "b.json": {"alterado_em": "2026-09-01"},
        "c.json": {},
    }), encoding="utf-8")
    assert pp.data_atualizacao() == "2026-09-01"


def test_build_por_municipio_ordena_por_obitos_e_calcula_taxa():
    por_mun = {
        "a": {2024: {"obitos": 10, "populacao": 1000}},
        "b": {2023: {"obitos": 50, "populacao": None}},
    }
    out = pp.build_por_municipio(por_mun, {"a": "A", "b": "B"}, {"a": "Reg1"}, 2024)
    assert [m["cod_ibge"] for m in out] == ["b", "a"]
    assert out[1] == {
        "cod_ibge": "a", "nome": "A", "municipio": "A", "regional": "Reg1",
        "ano": 2024, "obitos": 10, "populacao": 1000, "taxa": 10.0,
    }
    # Sem dado no último ano cai para o ano mais recente disponível
    assert out[0]["ano"] == 2023
    assert out[0]["taxa"] is None
    assert out[0]["regional"] == "-"


def test_build_piramide_agrega_80_mais_e_inverte_homens():
    rows = [
        {"D3N": "2024", "D6N": "Homens", "D7N": "80 a 84 anos", "V": "10"},
        {"D3N": "2024", "D6N": "Homens", "D7N": "90 a 94 anos", "V": "5"},
        {"D3N": "2024", "D6N": "Mulheres", "D7N": "Menos de 1 ano", "V": "3"},
        {"D3N": "2024", "D6N": "Mulheres", "D7N": "1 a 4 anos", "V": "2"},
        {"D3N": "2024", "D6N": "Ignorado", "D7N": "1 a 4 anos", "V": "99"},
    ]
    piramide, ano = pp.build_piramide(rows)
    assert ano == 2024
    por_faixa = {p["faixa"]: p for p in piramide}
    assert por_faixa["80+"] == {"faixa": "80+", "homens": -15, "mulheres": 0}
    assert por_faixa["0-4"] == {"faixa": "0-4", "homens": 0, "mulheres": 5}
    assert [p["faixa"] for p in piramide] == pp.FAIXAS_ORDEM


def test_build_nascidos_soma_estado_e_respeita_anos():
    rows = [
        sidra("a", "A", 2023, 10),
        sidra("b", "B", 2023, 5),
        sidra("a", "A", 2024, 7),
        sidra("a", "A", 2025, 1),
    ]
    assert pp.build_nascidos(rows, [2023, 2024]) == [
        {"ano": 2023, "total": 15},
        {"ano": 2024, "total": 7},
    ]


def test_ano_max_dominios_le_periodo_e_competencia_das_saidas(tmp_path):
    def grava(nome, meta):
        (tmp_path / nome).write_text(json.dumps({"metadata": meta}, ensure_ascii=False),
                                     encoding="utf-8")
    assert pp.ano_max_dominios(tmp_path) is None
    grava("internacoes.json", {"periodo": "2015-2025", "fonte": "SIH/SUS, São Paulo não"})
    grava("arboviroses.json", {"periodo": "2024-01..2026-38"})
    grava("cnpj_saude.json", {"competencia": "2026-09"})
    grava("mortalidade.json", {"periodo": "2003-2031"})  # saída do próprio preprocess: fora
    grava("geo_map.json", {})
    (tmp_path / "quebrado.json").write_text("{", encoding="utf-8")  # ilegível: ignorado
    assert pp.ano_max_dominios(tmp_path) == 2026


def test_montar_filtros_mantem_campos_antigos_e_separa_ibge_de_dominios():
    filtros = pp.montar_filtros(2003, 2024, list(range(2003, 2025)), 2026, pp.date(2026, 10, 11))
    assert filtros["anosDisponiveis"] == list(range(2003, 2027))
    assert filtros["anosComDados"] == list(range(2003, 2025))
    assert filtros["anoMin"] == 2003 and filtros["anoMax"] == 2024  # lido por useData.js
    assert filtros["anoMaxIbge"] == 2024 and filtros["anoMaxDominios"] == 2026
    assert "Registro Civil" in filtros["nota"]
    sem_dominios = pp.montar_filtros(2003, 2024, [2024], None, pp.date(2026, 1, 1))
    assert sem_dominios["anoMaxDominios"] == 2024


def test_somente_metadata_reescreve_metadata_sem_tocar_mortalidade(tmp_path, monkeypatch):
    # Cenário do SIDRA fora: sem brutos em data/raw, só o manifesto dos ETLs.
    pub, raw = tmp_path / "pub", tmp_path / "raw"
    pub.mkdir()
    raw.mkdir()
    monkeypatch.setattr(pp, "PUBLIC_DATA_DIR", pub)
    monkeypatch.setattr(pp, "RAW_DIR", raw)
    monkeypatch.setattr(pp, "MANIFEST_PATH", raw / "_manifest.json")
    monkeypatch.setattr(pp.sys, "argv", ["preprocess_data.py", "--somente-metadata"])
    (raw / "_manifest.json").write_text(json.dumps({
        "obitos_municipios_pr.json": {"alterado_em": "2026-08-01"},
        "datasus/sih.parquet": {"alterado_em": "2026-10-01"},
    }), encoding="utf-8")
    mortalidade = '{"metadata":{"atualizacao":"2026-08-01"},"porAno":[]}'
    (pub / "mortalidade.json").write_text(mortalidade, encoding="utf-8")
    antigo = {
        "dashboard": {"nome": "Saude Parana", "versao": "2.1.0", "atualizacao": "2026-08-01"},
        "dados": {"mortalidade": {"periodo": "2003-2024", "fonte": "IBGE, Óbitos"}},
        "geografia": {"municipios": 399},
        "filtros": {"anosComDados": [2023, 2024], "anoMin": 2023, "anoMax": 2024},
    }
    (pub / "metadata.json").write_text(json.dumps(antigo, ensure_ascii=False), encoding="utf-8")
    (pub / "internacoes.json").write_text(json.dumps({"metadata": {"periodo": "2015-2026"}}),
                                          encoding="utf-8")

    pp.main()

    novo = json.loads((pub / "metadata.json").read_text(encoding="utf-8"))
    assert novo["dashboard"]["atualizacao"] == "2026-10-01"
    assert novo["filtros"]["anoMaxDominios"] == 2026
    assert novo["filtros"]["anoMax"] == 2024 and novo["filtros"]["anosComDados"] == [2023, 2024]
    assert novo["dados"] == antigo["dados"] and novo["geografia"] == antigo["geografia"]
    assert (pub / "mortalidade.json").read_text(encoding="utf-8") == mortalidade


def _workflow(nome):
    import pytest
    yaml = pytest.importorskip("yaml")
    raiz = Path(__file__).resolve().parents[1] / ".github" / "workflows"
    return yaml.safe_load((raiz / nome).read_text(encoding="utf-8"))


def test_data_pipeline_reescreve_metadata_quando_download_falha():
    passos = {s.get("name"): s for s in _workflow("data-pipeline.yml")["jobs"]["process"]["steps"]}
    assert passos["Preprocess data"]["if"] == "steps.download.outcome == 'success'"
    so_meta = next(s for s in passos.values() if "--somente-metadata" in s.get("run", ""))
    assert so_meta["if"] == "steps.download.outcome == 'failure'"


def test_cnpj_pipeline_expoe_aceitar_variacao_via_env():
    wf = _workflow("cnpj-pipeline.yml")
    # PyYAML lê a chave "on" como True.
    entrada = wf[True]["workflow_dispatch"]["inputs"]["aceitar_variacao"]
    assert entrada["type"] == "boolean" and entrada["default"] is False
    passo = next(s for s in wf["jobs"]["consolidar"]["steps"]
                 if s.get("name", "").startswith("Consolidar"))
    assert passo["env"]["ACEITAR"] == "${{ inputs.aceitar_variacao }}"
    assert '[ "$ACEITAR" = "true" ]' in passo["run"] and "--aceitar-variacao" in passo["run"]
    assert "${{" not in passo["run"]  # anti-injeção: nada interpolado no shell
