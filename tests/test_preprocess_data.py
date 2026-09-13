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
