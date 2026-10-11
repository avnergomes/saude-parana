"""Regressões da 2ª revisão do grupo TabNet/SIM/SIOPS/SIH, sem rede.

- SIOPS: porAno termina no ano de referência (o front usa o último como KPI).
- TabNet: ausentes tolerados têm teto (LIMITE_AUSENTES); o SIOPS tolera sem
  limite (ano com poucas declarações vai para anosIncompletos) e confere a soma.
- SIM/SIH: linhas zeradas pedidas ao TabNet; no ano preliminar/parcial, município
  ausente com soma coerente com o Total é aceito; no ano completo, não.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import sih, siops, sim_cid, tabnet  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

TERRITORIO = [f"{410000 + i:06d}" for i in range(399)]
MAPA = {c: c + "0" for c in TERRITORIO}


def _municipio(valor):
    return {"populacao": 1000.0, "despesa_saude_hab": valor,
            "pct_receita_propria": valor, "transf_sus_hab": valor}


def _ano_siops(ano, n_com_dado):
    tabela = {f"41000{i}0": _municipio(float(ano) if i < n_com_dado else None) for i in range(10)}
    return siops.AnoSiops(ano, f"tabnet/siops_{ano}.csv", tabela)


def test_siops_por_ano_para_no_ano_de_referencia():
    saida = siops.montar_saida([_ano_siops(2024, 10), _ano_siops(2025, 3)], "2026-10-01")
    assert saida["anoReferencia"] == 2024
    assert [l["ano"] for l in saida["porAno"]] == [2024]
    assert saida["porAno"][-1]["despesa_saude_hab"] == 2024.0


def _csv_siops(codigos):
    linhas = "".join(f'"{c} São José";1000;1500,00;20,00;500,00\n' for c in codigos)
    n = 1000 * len(codigos)
    return ('"Munic-BR";"População";"2.1_D.Total_Saúde/Hab";'
            '"3.2_%R.Próprios_em_Saúde-EC_29";"R.Transf.SUS/Hab"\n'
            f'{linhas}"Total";{n};1500,00;20,00;500,00\n')


def test_siops_baixar_ano_aceita_50_ausentes_mas_confere_a_populacao(monkeypatch):
    # Ausentes sem limite no SIOPS: quem rejeita ano com poucas declarações é
    # ano_referencia; a soma da população contra o Total continua valendo.
    monkeypatch.setattr(tabnet, "consultar", lambda *a, **k: _csv_siops(TERRITORIO[:349]))
    _, dados = siops.baixar_ano(None, 2021, "indmun21.dbf", MAPA)
    assert len(dados.tabela) == 349
    assert dados.tabela["4100000"]["despesa_saude_hab"] == 1500.0
    truncado = _csv_siops(TERRITORIO[:349]).replace('"Total";349000', '"Total";350000')
    monkeypatch.setattr(tabnet, "consultar", lambda *a, **k: truncado)
    with pytest.raises(FonteIndisponivel, match="diverge do Total"):
        siops.baixar_ano(None, 2021, "indmun21.dbf", MAPA)


def test_campos_sim_e_sih_pedem_linhas_zeradas():
    assert sim_cid.campos("obtpr27.dbf")["zeradas"] == "exibirlz"
    assert sih.campos_capitulos(["nrpr2701.dbf"])["zeradas"] == "exibirlz"
    assert sih.campos_totais(["nrpr2701.dbf"])["zeradas"] == "exibirlz"


def _csv_sim(codigos, total, rodape):
    linhas = "".join(f'"{c} Nova Aliança do Ivaí";1;-;1\n' for c in codigos)
    return ('"Município";"Cap I";"Cap II";"Total"\n' + linhas
            + '"Total";{};0;{}\n'.format(total, total) + rodape)


RODAPE_2027 = (" Notas:\n Dados finais disponíveis até 2025.\n"
               " Dados de 2027 - 1a prévia - data de extração 01/03/2027.\n")


def test_sim_ano_preliminar_aceita_municipio_zerado_ausente(monkeypatch):
    texto = _csv_sim(TERRITORIO[1:], 398, RODAPE_2027)  # 410000 sem óbito: linha omitida
    monkeypatch.setattr(tabnet, "consultar", lambda *a, **k: texto)
    _, dados = sim_cid.baixar_ano(None, 2027, "obtpr27.dbf", MAPA)
    assert len(dados.tabela) == 398 and dados.ano_final == 2025
    assert dados.tabela["4100010"] == {"total": 1, "I": 1, "II": 0}  # "-" vira 0
    # Total divergente continua reprovado mesmo com o ausente tolerado.
    monkeypatch.setattr(tabnet, "consultar", lambda *a, **k: _csv_sim(TERRITORIO[1:], 399, RODAPE_2027))
    with pytest.raises(FonteIndisponivel, match="diverge do Total"):
        sim_cid.baixar_ano(None, 2027, "obtpr27.dbf", MAPA)


def test_sim_ano_final_continua_exigindo_os_399(monkeypatch):
    texto = _csv_sim(TERRITORIO[1:], 398, RODAPE_2027)
    monkeypatch.setattr(tabnet, "consultar", lambda *a, **k: texto)
    with pytest.raises(FonteIndisponivel, match="sem 1 dos 399"):
        sim_cid.baixar_ano(None, 2025, "obtpr25.dbf", MAPA)


def _csv_sih(codigos, coluna):
    if coluna == "cap":
        linhas = "".join(f'"{c} JARDIM OLINDA";2;-;2\n' for c in codigos)
        n = 2 * len(codigos)
        return '"Município";"Cap 01";"Cap 02";"Total"\n' + linhas + f'"Total";{n};0;{n}\n'
    linhas = "".join(f'"{c} JARDIM OLINDA";2;10,00;-\n' for c in codigos)
    n = 2 * len(codigos)
    return ('"Município";"Internações";"Valor_total";"Óbitos"\n' + linhas
            + f'"Total";{n};{5 * n},00;0\n')


def test_sih_ano_parcial_aceita_municipio_zerado_ausente(monkeypatch):
    def consultar(def_path, campos, **k):
        return _csv_sih(TERRITORIO[1:], "cap" if campos["Coluna"] == "Capítulo_CID-10" else "tot")
    monkeypatch.setattr(tabnet, "consultar", consultar)
    _, dados = sih.baixar_ano(None, 2027, ["nrpr2701.dbf"], MAPA)
    assert dados.parcial and len(dados.totais) == 398
    assert dados.totais["4100010"] == {"internacoes": 2, "valor_total": 10.0, "obitos": 0}
