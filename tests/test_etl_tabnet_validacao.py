"""Regressões da auditoria do grupo TabNet/SIM/SIOPS/SIH, sem rede.

- TabNet: território completo, linha Total obrigatória e soma conferida.
- SIM: ano final deduzido das notas ou erro; flag "preliminar" em porAno.
- SIOPS: ano de referência com >= 90% de preenchimento; ausentes e imputados.
- SIH: sem taxa anual no ano parcial.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import common, sih, siops, sim_cid, tabnet  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

# Território sintético de 399 municípios (códigos 410000..410398).
TERRITORIO = [f"{410000 + i:06d}" for i in range(399)]
CABECALHO = '"Município";"Cap I";"Cap II";"Total"\n'
RODAPE = " Fonte: SIM\n Notas:\n Dados finais disponíveis até 2024.\n"


def csv_municipal(codigos, total=None, com_total=True):
    """Uma linha "1;2;3" por município (nome com acento); Total = soma, salvo `total`."""
    linhas = "".join(f'"{c} São José";1;2;3\n' for c in codigos)
    n = len(codigos)
    total = total or (n, 2 * n, 3 * n)
    linha_total = '"Total";{};{};{}\n'.format(*total) if com_total else ""
    return " Mortalidade - Paraná\nPeríodo:2024\n" + CABECALHO + linhas + linha_total + RODAPE


# ── TabNet ──────────────────────────────────────────────────────────────

def test_parse_municipios_aceita_territorio_completo_com_total_coerente():
    registros = tabnet.parse_municipios(csv_municipal(TERRITORIO), set(TERRITORIO))
    assert len(registros) == 399
    assert registros[0]["nome"] == "São José"


def test_parse_municipios_rejeita_csv_truncado_em_395_linhas():
    # Antes o mínimo era 390: 395 municípios passavam. Total coerente com as 395
    # linhas, para isolar a checagem de território.
    texto = csv_municipal(TERRITORIO[:395])
    with pytest.raises(FonteIndisponivel, match="sem 4 dos 399"):
        tabnet.parse_municipios(texto, set(TERRITORIO))


def test_parse_municipios_rejeita_total_divergente():
    texto = csv_municipal(TERRITORIO, total=(399, 798, 1196))
    with pytest.raises(FonteIndisponivel, match="diverge do Total"):
        tabnet.parse_municipios(texto, set(TERRITORIO))


def test_parse_municipios_exige_linha_total():
    with pytest.raises(FonteIndisponivel, match="sem linha Total"):
        tabnet.parse_municipios(csv_municipal(TERRITORIO, com_total=False), set(TERRITORIO))


def test_soma_inclui_municipio_ignorado_e_tolera_meio_centavo():
    # O Total do TabNet inclui "MUNICIPIO IGNORADO" (linha sem código IBGE).
    texto = ('"Município";"Valor_total"\n" MUNICIPIO IGNORADO - PR";0,10\n'
             '"410010 Abatiá";0,10\n"410020 Adrianópolis";0,10\n"Total";0,30\n')
    assert len(tabnet.parse_municipios(texto, {"410010", "410020"})) == 3
    with pytest.raises(FonteIndisponivel):
        tabnet.parse_municipios(texto.replace('"Total";0,30', '"Total";0,32'), {"410010", "410020"})


def test_tolerar_ausentes_e_colunas_soma_para_fontes_como_o_siops():
    texto = ('"Munic-BR";"População";"2.1_D.Total_Saúde/Hab"\n'
             '"410010 Abatiá";7000;1500,00\n"Total";7000;1500,00\n')
    esperados = {"410010", "411573"}
    with pytest.raises(FonteIndisponivel):
        tabnet.parse_municipios(texto, esperados, colunas_soma=["População"])
    registros = tabnet.parse_municipios(texto, esperados, colunas_soma=["População"],
                                        tolerar_ausentes=1)
    assert [r["cod6"] for r in registros] == ["410010"]
    # A soma da população continua conferida mesmo com ausentes tolerados.
    with pytest.raises(FonteIndisponivel):
        tabnet.parse_municipios(texto.replace('"Total";7000', '"Total";9000'), esperados,
                                colunas_soma=["População"], tolerar_ausentes=1)


# ── SIM ─────────────────────────────────────────────────────────────────

def test_ano_final_deduz_das_notas_de_preliminares_quando_falta_a_nota_final():
    rodape = (" Notas:\n Dados de 2025 - Preliminares - data de extração 28/07/2026.\n"
              " Dados de 2026 - 2a prévia - data de extração 01/09/2026.\n")
    assert sim_cid.ano_final(rodape) == 2024


def test_ano_final_sem_nenhuma_nota_levanta_em_vez_de_congelar():
    with pytest.raises(FonteIndisponivel):
        sim_cid.ano_final(" Notas:\n Consulte o site da Secretaria.\n")


def test_por_ano_marca_anos_preliminares():
    tabela = {"4100103": {"total": 1, "I": 1}}
    anos = [sim_cid.AnoSim(a, f"tabnet/sim_{a}.csv", tabela, 2024) for a in (2023, 2024, 2025, 2026)]
    saida = sim_cid.montar_saida(anos, "2026-10-01")
    assert [(l["ano"], l["preliminar"]) for l in saida["porAno"]] == [
        (2023, False), (2024, False), (2025, True), (2026, True)]
    assert saida["metadata"]["preliminares"] == [2025, 2026]


# ── SIOPS ───────────────────────────────────────────────────────────────

def _municipio(valor):
    return {"populacao": 1000.0, "despesa_saude_hab": valor,
            "pct_receita_propria": valor, "transf_sus_hab": valor}


def _ano_siops(ano, n_com_dado, ausentes=()):
    """Ano com 10 municípios: os n primeiros com dado, o resto vazio; `ausentes` fora."""
    cods = [f"41000{i}0" for i in range(10)]
    tabela = {c: _municipio(float(ano) if i < n_com_dado else None)
              for i, c in enumerate(cods) if c not in ausentes}
    return siops.AnoSiops(ano, f"tabnet/siops_{ano}.csv", tabela)


def test_siops_ano_com_menos_de_90_por_cento_nao_vira_referencia():
    # 2025 com 8 de 10 (80%): antes virava referência por ser o último da lista.
    saida = siops.montar_saida([_ano_siops(2024, 10), _ano_siops(2025, 8)], "2026-10-01")
    assert saida["anoReferencia"] == 2024
    assert saida["metadata"]["anosIncompletos"] == [
        {"ano": 2025, "preenchidos": 8, "municipios": 10}]
    assert saida["metadata"]["imputados"] == {}
    assert saida["metadata"]["periodo"] == "2024-2025"


def test_siops_registra_imputados_e_ausentes():
    # 2025 com 9 de 10 (90%) vira referência; o 10º usa 2024 (imputado).
    # 2024 sem o município 4100050 na tabulação (como Mato Rico em 2021).
    anos = [_ano_siops(2024, 10, ausentes={"4100050"}), _ano_siops(2025, 9)]
    saida = siops.montar_saida(anos, "2026-10-01")
    assert saida["anoReferencia"] == 2025
    assert saida["metadata"]["anosIncompletos"] == []
    assert saida["metadata"]["imputados"] == {"4100090": 2024}
    assert saida["porMunicipio"]["4100090"]["ano"] == 2024
    assert saida["metadata"]["ausentes"] == {"2024": ["4100050"]}


def test_siops_sem_ano_preenchido_levanta():
    with pytest.raises(FonteIndisponivel):
        siops.ano_referencia([_ano_siops(2025, 1)])


def test_siops_nota_descreve_media_ponderada_pela_populacao():
    saida = siops.montar_saida([_ano_siops(2024, 10)], "2026-10-01")
    assert "média ponderada pela população" in saida["metadata"]["nota"]
    assert "reproduz o total" not in (siops.__doc__ or "")


# ── SIH ─────────────────────────────────────────────────────────────────

def test_sih_ano_parcial_nao_tem_taxa_anual():
    totais = {"4100103": {"internacoes": 70, "valor_total": 1.0, "obitos": 0}}
    pop = {"4100103": {2025: 1000, 2026: 1000}}
    anos = [sih.AnoSih(2025, ("a", "b"), False, {}, totais),
            sih.AnoSih(2026, ("c", "d"), True, {}, totais)]
    serie = sih.serie_por_ano(anos, pop)
    assert serie[0]["taxa"] == 70.0
    assert serie[1]["taxa"] is None and serie[1]["parcial"] is True
    assert serie[1]["internacoes"] == 70  # contagens do ano parcial continuam publicadas


def test_sih_baixar_ano_rejeita_tabulacao_sem_todos_os_municipios(monkeypatch):
    texto = ('"Município";"Internações";"Valor_total";"Óbitos"\n'
             '"410010 ABATIA";5;10,00;1\n"Total";5;10,00;1\n')
    monkeypatch.setattr(tabnet, "consultar", lambda *a, **k: texto)
    with pytest.raises(FonteIndisponivel):
        # Ano completo (12 meses): sem tolerância a ausentes.
        sih.baixar_ano(None, 2025, [f"nrpr25{m:02d}.dbf" for m in range(1, 13)],
                       {"410010": "4100103", "410020": "4100202"})


def test_common_territorio_tem_399_municipios():
    assert len(common.cod6_para_7()) == 399
