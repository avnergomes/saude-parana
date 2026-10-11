"""A validação nova do TabNet não pode reprovar os brutos versionados de hoje.

Roda parse_municipios (território de common.cod6_para_7, linha Total, soma) em
cada data/raw/tabnet/*.csv com a mesma tolerância a ausentes dos ETLs, sem rede.
O próprio data-pipeline reescreve esses brutos (e "Run tests" roda antes do
download): só cabem aqui invariantes válidas para qualquer bruto válido, nunca
valores do dia (ano final, ano de referência, lista de ausentes).
"""

import re
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

from etl import common, sih, siops, sim_cid, tabnet  # noqa: E402

BRUTOS = sorted((RAIZ / "data" / "raw" / "tabnet").glob("*.csv"))
pytestmark = pytest.mark.skipif(not BRUTOS, reason="sem brutos versionados em data/raw/tabnet")

_RE_ANO = re.compile(r"_(\d{4})(?:_totais)?\.csv$")
_RE_MES = re.compile(r"\b[A-Z][a-z]{2}/\d{4}\b")


def _ano(caminho: Path) -> int:
    return int(_RE_ANO.search(caminho.name).group(1))


def _meses_sih(texto: str) -> int:
    """Meses da linha "Período:" do CSV do SIH (ex.: "Jul/2026, ..., Jan/2026")."""
    linha = next(li for li in texto.splitlines() if li.startswith("Período:"))
    meses = len(_RE_MES.findall(linha))
    assert meses, f"linha Período sem meses: {linha!r}"  # senão todo ano viraria parcial
    return meses


def _parse(caminho: Path) -> list[dict]:
    """Mesma tolerância dos ETLs: SIOPS sem limite (siops.parse_ano); SIM tolera
    LIMITE_AUSENTES só em ano preliminar (sim_cid.baixar_ano); SIH só em ano
    parcial (sih.baixar_ano)."""
    texto = caminho.read_text(encoding="utf-8")
    mapa = common.cod6_para_7()
    if caminho.name.startswith("siops_"):
        return siops.parse_ano(texto, mapa)
    if caminho.name.startswith("sim_"):
        preliminar = _ano(caminho) > sim_cid.ano_final(texto)
        tolerar = tabnet.LIMITE_AUSENTES if preliminar else 0
    elif caminho.name.startswith("sih_"):
        parcial = _meses_sih(texto) < sih.CONFIG.meses_por_ano
        tolerar = tabnet.LIMITE_AUSENTES if parcial else 0
    else:
        tolerar = 0
    return tabnet.parse_municipios(texto, set(mapa), tolerar_ausentes=tolerar)


@pytest.mark.parametrize("caminho", BRUTOS, ids=lambda p: p.name)
def test_bruto_versionado_passa_na_validacao(caminho):
    assert _parse(caminho)


SIM = [p for p in BRUTOS if p.name.startswith("sim_")]


def _confere_ano_final(texto: str, anos: list[int]) -> None:
    # O ano final avança a cada fechamento do SIM: só se exige que exista e que
    # seja um dos anos tabulados (nenhum ano final além do último arquivo).
    final = sim_cid.ano_final(texto)
    assert isinstance(final, int)
    assert min(anos) <= final <= max(anos)


@pytest.mark.parametrize("caminho", SIM, ids=lambda p: p.name)
def test_sim_versionado_tem_ano_final_no_rodape(caminho):
    _confere_ano_final(caminho.read_text(encoding="utf-8"), [_ano(p) for p in SIM])


def _confere_saida_siops(caminhos: list[Path]) -> None:
    mapa = common.cod6_para_7()
    anos = [siops.AnoSiops(_ano(p), p.name, siops.valores_por_municipio(_parse(p), mapa))
            for p in caminhos]
    saida = siops.montar_saida(anos, "2026-10-01")
    ref = saida["anoReferencia"]
    assert saida["porAno"][-1]["ano"] == ref
    assert all(a["ano"] > ref for a in saida["metadata"]["anosIncompletos"])
    assert {a["ano"] for a in saida["metadata"]["anosIncompletos"]} | {
        r["ano"] for r in saida["porAno"]} == {a.ano for a in anos}
    validos = set(mapa.values())
    assert all(set(lista) <= validos for lista in saida["metadata"]["ausentes"].values())


SIOPS = [p for p in BRUTOS if p.name.startswith("siops_")]


@pytest.mark.skipif(not SIOPS, reason="sem brutos do SIOPS")
def test_siops_versionado_produz_saida_coerente():
    _confere_saida_siops(SIOPS)


# ── Regressão: brutos novos e legítimos não podem reprovar os testes ────

def _sem_municipios(texto: str, manter) -> str:
    """Remove as linhas de município para as quais manter(cod6) é falso e
    desconta das colunas inteiras da linha Total o que elas somavam."""
    def numero(v: str) -> int | None:
        v = v.strip('"')
        return 0 if v == "-" else int(v) if v.isdigit() else None

    saida, removidas = [], []
    for linha in texto.split("\n"):
        cod6 = linha[1:7]
        if cod6.isdigit() and linha[7:8] == " " and not manter(cod6):
            removidas.append(linha.split(";"))
            continue
        saida.append(linha)
    for n, linha in enumerate(saida):
        if linha.startswith('"Total"'):
            campos = linha.split(";")
            for j in range(1, len(campos)):
                if numero(campos[j]) is not None:
                    campos[j] = str(numero(campos[j]) - sum(numero(r[j]) or 0 for r in removidas))
            saida[n] = ";".join(campos)
    return "\n".join(saida)


def test_ano_final_que_avanca_no_rodape_continua_valido():
    texto = SIM[-1].read_text(encoding="utf-8")
    final = sim_cid.ano_final(texto)
    novo = texto.replace(f"até {final}", f"até {final + 1}")
    _confere_ano_final(novo, [_ano(p) for p in SIM])


def test_sim_preliminar_com_municipio_ausente_usa_a_tolerancia_do_etl(tmp_path):
    texto = SIM[-1].read_text(encoding="utf-8")
    if _ano(SIM[-1]) <= sim_cid.ano_final(texto):
        pytest.skip("último bruto do SIM não é preliminar")
    caminho = tmp_path / SIM[-1].name
    caminho.write_text(_sem_municipios(texto, lambda c: c != "410010"), encoding="utf-8")
    assert _parse(caminho)


@pytest.mark.skipif(not SIOPS, reason="sem brutos do SIOPS")
def test_siops_com_ano_novo_incompleto_continua_coerente(tmp_path):
    ultimo = SIOPS[-1]
    declarados = sorted(common.cod6_para_7())[:30]
    novo = tmp_path / f"siops_{_ano(ultimo) + 1}.csv"
    novo.write_text(_sem_municipios(ultimo.read_text(encoding="utf-8"),
                                    lambda c: c in declarados), encoding="utf-8")
    _confere_saida_siops([*SIOPS, novo])
