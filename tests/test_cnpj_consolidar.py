# -*- coding: utf-8 -*-
"""Testes da consolidação CNPJ (sem rede): duas partes reduzidas em fixture."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cnpj import consolidar, filtrar  # noqa: E402
from cnpj.filtrar import LinhaReduzida  # noqa: E402
from etl import common  # noqa: E402

GEO = {
    "4106902": {"nome": "Curitiba", "regional": "Curitiba"},
    "4101655": {"nome": "Arapuã", "regional": "Ivaiporã"},
    "4103156": {"nome": "Bom Jesus do Sul", "regional": "Francisco Beltrão"},
}
POP = {"4106902": {2025: 1_800_000, 2026: 1_832_183}, "4101655": {2026: 3_500}}

MUNICIPIOS_CSV = (
    "CÓDIGO DO MUNICÍPIO - TOM;CÓDIGO DO MUNICÍPIO - IBGE;MUNICÍPIO - TOM;MUNICÍPIO - IBGE;UF\n"
    "7535;4106902;CURITIBA;Curitiba;PR\n"
    "830;4101655;ARAPUÃ;Arapuã;PR\n"
    "999;4103156;BOM JESUS DO SUL;Bom Jesus do Sul;PR\n"
    "8123;4302303;BOM JESUS;Bom Jesus;RS\n"  # homônimo em outra UF: fora do mapa
    "9707;0;EXTERIOR;;EX\n"
)

PARTE_0 = (
    LinhaReduzida("1", "02", "20180406", "8630504", (), "7535"),  # Curitiba, clínica ativa
    LinhaReduzida("2", "02", "20200101", "8610101", (), "7535"),  # Curitiba, hospital ativo (filial)
    LinhaReduzida("1", "08", "20100101", "8610101", (), "7535"),  # Curitiba, hospital baixado
    LinhaReduzida("1", "02", "19950101", "4771701", (), "0830"),  # Arapuã, farmácia de 1995
    LinhaReduzida("1", "02", "20180406", "4711302", ("8650001",), "0830"),  # Arapuã, só secundária
)
PARTE_1 = (
    LinhaReduzida("1", "02", "20200505", "8650001", (), "830"),  # Arapuã, TOM sem zero
    LinhaReduzida("1", "04", "20200505", "8640201", (), "0999"),  # Bom Jesus do Sul, inapta
    LinhaReduzida("1", "02", "20210101", "8690901", (), "9999"),  # TOM não mapeado
    LinhaReduzida("1", "02", "20210101", "8630504", (), "7535"),  # Curitiba, clínica 2021
)
TODAS = PARTE_0 + PARTE_1


@pytest.fixture
def pasta_partes(tmp_path: Path) -> Path:
    pasta = tmp_path / "partes"
    pasta.mkdir()
    (pasta / "parte_0.csv").write_text(filtrar.serializar(PARTE_0), encoding="utf-8")
    (pasta / "parte_1.csv").write_text(filtrar.serializar(PARTE_1), encoding="utf-8")
    return pasta


@pytest.fixture
def tom_ibge() -> dict[str, str]:
    return consolidar.mapa_tom_ibge(MUNICIPIOS_CSV)


# ── TOM -> IBGE ─────────────────────────────────────────────────────────

def test_mapa_tom_ibge_so_pr_normalizado_e_sem_exterior(tom_ibge):
    assert tom_ibge == {"7535": "4106902", "830": "4101655", "999": "4103156"}
    assert consolidar.normalizar_tom("0830") == consolidar.normalizar_tom("830") == "830"
    assert consolidar.normalizar_tom("0000") == "0"


def test_mapa_tom_ibge_exige_cabecalho_oficial():
    with pytest.raises(common.FonteIndisponivel):
        consolidar.mapa_tom_ibge("TOM;IBGE;NOME;NOME2;UF\n7535;4106902;CURITIBA;Curitiba;PR\n")


def test_validar_mapa_contra_o_geo_map(tom_ibge):
    consolidar.validar_mapa(tom_ibge, GEO)
    with pytest.raises(common.FonteIndisponivel, match="faltam"):
        consolidar.validar_mapa(tom_ibge, {**GEO, "4100103": {"nome": "Abatiá", "regional": "x"}})
    with pytest.raises(common.FonteIndisponivel, match="sobram"):
        consolidar.validar_mapa({**tom_ibge, "1": "4300000"}, GEO)


# ── Leitura das partes ──────────────────────────────────────────────────

def test_ler_partes_le_todas_em_ordem(pasta_partes: Path):
    partes = consolidar.ler_partes(pasta_partes, consolidar.Config(esperadas=2))
    assert partes.recebidas == 2 and partes.invalidas == 0
    assert partes.linhas == TODAS


def test_ler_partes_falha_se_faltar_parte(pasta_partes: Path):
    with pytest.raises(common.FonteIndisponivel, match="2 partes"):
        consolidar.ler_partes(pasta_partes, consolidar.Config(esperadas=10))


def test_ler_parte_rejeita_cabecalho_errado_e_conta_linha_malformada(tmp_path: Path):
    ruim = tmp_path / "parte_0.csv"
    ruim.write_text("cnpj;situacao\n1;02\n", encoding="utf-8")
    with pytest.raises(common.FonteIndisponivel):
        consolidar.ler_parte(ruim)
    torta = tmp_path / "parte_1.csv"
    torta.write_text(filtrar.serializar(PARTE_0[:1]) + "1;02\n", encoding="utf-8")
    linhas, invalidas = consolidar.ler_parte(torta)
    assert linhas == PARTE_0[:1] and invalidas == 1


# ── Agregação ───────────────────────────────────────────────────────────

def test_agregar_conta_por_municipio_grupo_e_situacao(tom_ibge):
    agregado = consolidar.agregar(TODAS, tom_ibge, GEO)
    curitiba = agregado.por_municipio["4106902"]
    assert curitiba["ativos"] == 3 and curitiba["inativos"] == 1
    assert curitiba["clinicas_consultorios"] == 2 and curitiba["hospitais"] == 1
    arapua = agregado.por_municipio["4101655"]
    assert arapua["ativos"] == 2 and arapua["saude_secundaria"] == 1
    assert arapua["farmacias"] == 1 and arapua["profissionais_saude"] == 1
    bom_jesus = agregado.por_municipio["4103156"]
    assert bom_jesus["ativos"] == 0 and bom_jesus["inativos"] == 1
    assert agregado.totais == {"ativos": 5, "inativos": 2, "matrizes": 4, "filiais": 1}
    assert agregado.tom_nao_mapeado == 1 and agregado.linhas_invalidas == 0
    assert agregado.aberturas[2020] == {"total": 2, "hospitais": 1, "profissionais_saude": 1}
    assert 1995 in agregado.aberturas  # contada; só sai da lista ao montar (ano < 2000)


def test_agregar_conta_linha_sem_saude_como_invalida(tom_ibge):
    sem_saude = (LinhaReduzida("1", "02", "20200101", "4711302", (), "7535"),)
    agregado = consolidar.agregar(sem_saude, tom_ibge, GEO)
    assert agregado.linhas_invalidas == 1 and agregado.totais == {}


def test_verificar_descartes_tolera_1_por_cento(tom_ibge):
    agregado = consolidar.agregar(TODAS, tom_ibge, GEO)  # 1 de 9 não mapeado
    with pytest.raises(common.FonteIndisponivel, match="TOM não mapeado"):
        consolidar.verificar_descartes(agregado, len(TODAS))
    consolidar.verificar_descartes(agregado, 1000)


def test_montar_saida_respeita_o_contrato(tom_ibge):
    agregado = consolidar.agregar(TODAS, tom_ibge, GEO)
    saida = consolidar.montar_saida(agregado, 2, "2026-08", "2026-09-13", GEO, POP)
    assert list(saida) == ["metadata", "grupos", "porMunicipio", "aberturasPorAno", "totais"]
    meta = saida["metadata"]
    assert list(meta) == ["fonte", "competencia", "atualizacao", "criterio", "nota", "descartados"]
    assert meta["fonte"].endswith("competência 2026-08") and meta["competencia"] == "2026-08"
    assert meta["atualizacao"] == "2026-09-13"
    assert meta["descartados"] == {"tomNaoMapeado": 1, "linhasInvalidas": 0, "partesRecebidas": 2}
    assert "LGPD" in meta["nota"] and "2026" in meta["nota"]
    assert [g["codigo"] for g in saida["grupos"]] == [
        "clinicas_consultorios", "hospitais", "profissionais_saude", "farmacias",
        "urgencia_remocao", "diagnostico", "apoio_gestao", "outras_saude"]
    assert saida["grupos"][0]["ativos"] == 2 and saida["grupos"][-1]["ativos"] == 0
    assert saida["totais"] == {"ativos": 5, "inativos": 2, "matrizes": 4, "filiais": 1,
                               "municipios": 3}


def test_montar_saida_por_municipio_tem_todos_com_chaves_na_ordem(tom_ibge):
    agregado = consolidar.agregar(TODAS, tom_ibge, GEO)
    saida = consolidar.montar_saida(agregado, 2, "2026-08", "2026-09-13", GEO, POP)
    por_mun = saida["porMunicipio"]
    assert list(por_mun) == ["4101655", "4103156", "4106902"]  # ordem crescente do IBGE
    assert por_mun["4106902"] == {
        "ativos": 3, "inativos": 1, "hospitais": 1, "urgencia_remocao": 0,
        "clinicas_consultorios": 2, "diagnostico": 0, "profissionais_saude": 0,
        "apoio_gestao": 0, "outras_saude": 0, "farmacias": 0, "saude_secundaria": 0,
        "populacao": 1_832_183, "ativos_por_10mil": round(3 / 1_832_183 * 10_000, 2),
    }
    arapua = por_mun["4101655"]
    assert arapua["ativos"] == 2 and arapua["saude_secundaria"] == 1
    assert arapua["populacao"] == 3_500 and arapua["ativos_por_10mil"] == 5.71
    bom_jesus = por_mun["4103156"]
    assert bom_jesus["ativos"] == 0 and bom_jesus["inativos"] == 1
    assert bom_jesus["populacao"] is None and bom_jesus["ativos_por_10mil"] is None


def test_montar_saida_aberturas_por_ano_de_2000_ate_a_competencia(tom_ibge):
    agregado = consolidar.agregar(TODAS, tom_ibge, GEO)
    saida = consolidar.montar_saida(agregado, 2, "2026-08", "2026-09-13", GEO, POP)
    anos = saida["aberturasPorAno"]
    assert [a["ano"] for a in anos] == list(range(2000, 2027))
    por_ano = {a["ano"]: a for a in anos}
    assert list(por_ano[2000]) == ["ano", "total", "hospitais", "urgencia_remocao",
                                   "clinicas_consultorios", "diagnostico", "profissionais_saude",
                                   "apoio_gestao", "outras_saude", "farmacias"]
    assert por_ano[2018] == {**por_ano[2000], "ano": 2018, "total": 1, "clinicas_consultorios": 1}
    assert por_ano[2020]["total"] == 2 and por_ano[2020]["hospitais"] == 1
    assert por_ano[2021]["total"] == 1 and por_ano[2010]["total"] == 0  # 2010 é hospital baixado
    assert sum(a["total"] for a in anos) == 4  # a farmácia de 1995 fica fora da lista


def test_montar_saida_e_deterministica_e_nao_muta_entradas(tom_ibge):
    geo_antes = json.dumps(GEO, sort_keys=True)
    a = consolidar.agregar(TODAS, tom_ibge, GEO)
    b = consolidar.agregar(tuple(reversed(TODAS)), tom_ibge, GEO)
    texto_a = json.dumps(consolidar.montar_saida(a, 2, "2026-08", "2026-09-13", GEO, POP),
                         ensure_ascii=False, separators=(",", ":"))
    texto_b = json.dumps(consolidar.montar_saida(b, 2, "2026-08", "2026-09-13", GEO, POP),
                         ensure_ascii=False, separators=(",", ":"))
    assert texto_a == texto_b
    assert json.dumps(GEO, sort_keys=True) == geo_antes
    assert "Farmácias" in texto_a and "Urgência" in texto_a


# ── Ponta a ponta (manifesto, brutos e JSON em pasta temporária) ────────

class HttpFalso:
    def get(self, url, timeout=None):
        return RespostaFalsa(MUNICIPIOS_CSV.encode("latin-1"))


class RespostaFalsa:
    def __init__(self, conteudo: bytes):
        self.content = conteudo

    def raise_for_status(self) -> None:
        return None


def test_executar_grava_json_manifesto_e_tabela_utf8(pasta_partes: Path, tmp_path: Path, monkeypatch):
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "pub")
    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "MANIFEST_PATH", tmp_path / "raw" / "_manifest.json")
    monkeypatch.setattr(common, "geo_municipios", lambda: GEO)
    monkeypatch.setattr(common, "populacao_municipal", lambda: POP)
    cfg = consolidar.Config(esperadas=2, limite_tom_nao_mapeado=0.5)
    # Linha malformada (2 campos) numa parte: sai da contagem e vira linhasInvalidas.
    with open(pasta_partes / "parte_0.csv", "a", encoding="utf-8") as f:
        f.write("1;02\n")

    saida = consolidar.executar(pasta_partes, "2026-08", cfg, http=HttpFalso())

    gravado = json.loads((tmp_path / "pub" / "cnpj_saude.json").read_text(encoding="utf-8"))
    assert gravado == saida
    assert gravado["totais"]["ativos"] == 5
    assert gravado["metadata"]["descartados"] == {"tomNaoMapeado": 1, "linhasInvalidas": 1,
                                                  "partesRecebidas": 2}
    tabela = (tmp_path / "raw" / "cnpj" / "municipios_tom_ibge.csv").read_text(encoding="utf-8")
    assert "830;4101655;ARAPUÃ;Arapuã;PR" in tabela  # Latin-1 convertida com acento intacto
    manifesto = json.loads((tmp_path / "raw" / "_manifest.json").read_text(encoding="utf-8"))
    assert set(manifesto) == {"cnpj/municipios_tom_ibge.csv", "cnpj/estabelecimentos_pr_saude.csv"}
    assert manifesto["cnpj/estabelecimentos_pr_saude.csv"]["linhas"] == 9
    assert manifesto["cnpj/municipios_tom_ibge.csv"]["linhas"] == 5
    assert not (tmp_path / "raw" / "cnpj" / "estabelecimentos_pr_saude.csv").exists()  # só o hash
    assert gravado["metadata"]["atualizacao"] == manifesto["cnpj/estabelecimentos_pr_saude.csv"]["alterado_em"]


def test_executar_falha_com_partes_faltando_sem_gravar(pasta_partes: Path, tmp_path: Path, monkeypatch):
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "pub")
    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "MANIFEST_PATH", tmp_path / "raw" / "_manifest.json")
    with pytest.raises(common.FonteIndisponivel):
        consolidar.executar(pasta_partes, "2026-08", consolidar.Config(esperadas=10), http=HttpFalso())
    assert not (tmp_path / "pub").exists() and not (tmp_path / "raw").exists()
