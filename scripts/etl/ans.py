# -*- coding: utf-8 -*-
"""
ETL da cobertura de planos de saúde privados por município do Paraná.

Fonte: ANS, Dados Abertos, PDA 047 "Taxa de cobertura de planos de saúde"
(CSV nacional, ISO-8859-1, separador ';', decimal com vírgula). O arquivo é
uma foto do ano de referência (PERIODO = ano, ex. "2026"), com uma linha por
município x SEXO x FAIXA_ETARIA, sem linhas de total: a soma das 26 linhas
de cada município é o total de beneficiários. A coluna POPULACAO vem zerada
para quase todos os municípios, por isso o denominador é a estimativa IBGE
do ano do período (mesma base de população do restante do dashboard).

Saída: dashboard/public/data/planos_saude.json
Bruto: data/raw/ans/pda047_pr.csv (cabeçalho + linhas da UF, em UTF-8)
"""

from __future__ import annotations

import csv
import io
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass

import requests

from etl import common
from etl.common import FonteIndisponivel

DOMINIO = "ans"
SAIDA = "planos_saude.json"

FONTE = ("ANS, Dados Abertos (PDA 047, taxa de cobertura de planos de saúde "
         "por município)")
NOTA = ("PERIODO = ano de referência da foto de beneficiários (uma publicação por "
        "vez); beneficiários somados sobre sexo x faixa etária (inclui faixa "
        "'Inconsistente'; o arquivo não traz linhas de total); beneficiários = vínculos "
        "a planos (a taxa pode passar de 100%); denominador = estimativa IBGE do ano, "
        "pois POPULACAO vem zerada na ANS; taxas em %")
DESCRICAO = "ANS PDA 047, taxa de cobertura de planos de saúde: linhas do PR"

COLUNAS_OBRIGATORIAS = (
    "PERIODO", "CD_MUNICIPIO", "SG_UF", "SEXO", "FAIXA_ETARIA",
    "BENEF_ASSISTENCIA_MEDICA", "BENEF_EXCLUS_ODONTOLOGICO", "BENEF_TOTAL", "POPULACAO",
)
CATEGORIAS_TOTAL = frozenset({"TOTAL", "TODOS", "TODAS", "GERAL"})

log = logging.getLogger("etl.ans")

Populacao = Callable[[str, int], int | None]


@dataclass(frozen=True)
class ConfigAns:
    url: str = ("https://dadosabertos.ans.gov.br/FTP/PDA/"
                "taxa_de_cobertura_de_planos_de_saude-047/pda-047-taxa_cobertura.csv")
    codificacao: str = "iso-8859-1"
    separador: str = ";"
    uf: str = "PR"
    timeout: int = 300


CONFIG = ConfigAns()


# ── Download ────────────────────────────────────────────────────────────

def filtrar_uf(linhas: Iterable[str], cfg: ConfigAns) -> str:
    """Mantém o cabeçalho e as linhas (verbatim) cuja coluna SG_UF é a UF pedida."""
    iterador = iter(linhas)
    cabecalho = next(iterador, "")
    colunas = next(csv.reader([cabecalho], delimiter=cfg.separador), [])
    faltam = [c for c in COLUNAS_OBRIGATORIAS if c not in colunas]
    if faltam:
        raise FonteIndisponivel(f"ANS: cabeçalho sem as colunas {faltam}")
    idx = colunas.index("SG_UF")
    mantidas = [cabecalho.rstrip("\r\n")]
    for linha in iterador:
        campos = next(csv.reader([linha], delimiter=cfg.separador), [])
        if len(campos) > idx and campos[idx].strip() == cfg.uf:
            mantidas.append(linha.rstrip("\r\n"))
    return "\n".join(mantidas) + "\n"


def baixar_subconjunto_uf(http: requests.Session, cfg: ConfigAns) -> str:
    """Baixa o CSV nacional em streaming e devolve só as linhas da UF (texto)."""
    try:
        with http.get(cfg.url, stream=True, timeout=cfg.timeout) as resp:
            resp.raise_for_status()
            linhas = (b.decode(cfg.codificacao) for b in resp.iter_lines(chunk_size=1 << 20))
            texto = filtrar_uf(linhas, cfg)
    except (requests.RequestException, UnicodeDecodeError) as exc:
        raise FonteIndisponivel(f"ANS: {exc}") from exc
    log.info("  ANS: %d linhas do %s", texto.count("\n") - 1, cfg.uf)
    return texto


# ── Normalização ────────────────────────────────────────────────────────

def numero(texto: str | None) -> float:
    """'12,5' -> 12.5; vazio -> 0.0."""
    t = (texto or "").strip().replace(",", ".")
    return float(t) if t else 0.0


def inteiro(texto: str | None) -> int:
    return int(round(numero(texto)))


def normalizar_periodo(periodo: str) -> str:
    """'2026' -> '2026'; '202612' -> '2026-12'; '12/2026' -> '2026-12'."""
    p = periodo.strip()
    if "/" in p:
        mes, ano = p.split("/", 1)
        return f"{ano.strip()}-{int(mes):02d}"
    if len(p) == 6 and p.isdigit():
        return f"{p[:4]}-{p[4:]}"
    return p


def ano_do_periodo(periodo: str) -> int:
    return int(periodo[:4])


def linha_de_total(row: dict) -> bool:
    """Linha agregada (sexo ou faixa 'Total'), se algum dia aparecer no arquivo."""
    return any(str(row.get(c) or "").strip().upper() in CATEGORIAS_TOTAL
               for c in ("SEXO", "FAIXA_ETARIA"))


def agregar(texto_csv: str, cod6_para_7: dict[str, str],
            cfg: ConfigAns) -> tuple[dict[str, dict[str, dict]], dict]:
    """Soma beneficiários sobre SEXO x FAIXA_ETARIA por (período, município).
    Devolve ({período: {cod7: totais}}, descartados)."""
    leitor = csv.DictReader(io.StringIO(texto_csv), delimiter=cfg.separador)
    acc: dict[str, dict[str, dict]] = {}
    nao_mapeados: dict[str, int] = {}
    totais_ignorados = 0
    for row in leitor:
        if linha_de_total(row):
            totais_ignorados += 1
            continue
        cod6 = (row.get("CD_MUNICIPIO") or "").strip()[:6]
        cod7 = cod6_para_7.get(cod6)
        if cod7 is None:
            nao_mapeados[cod6] = nao_mapeados.get(cod6, 0) + inteiro(row["BENEF_TOTAL"])
            continue
        periodo = normalizar_periodo(row["PERIODO"])
        m = acc.setdefault(periodo, {}).setdefault(cod7, {
            "beneficiarios": 0, "beneficiarios_medico": 0,
            "beneficiarios_odonto": 0, "populacao_ans": 0})
        m["beneficiarios"] += inteiro(row["BENEF_TOTAL"])
        m["beneficiarios_medico"] += inteiro(row["BENEF_ASSISTENCIA_MEDICA"])
        m["beneficiarios_odonto"] += inteiro(row["BENEF_EXCLUS_ODONTOLOGICO"])
        m["populacao_ans"] += inteiro(row["POPULACAO"])
    descartados = {"codigosNaoMapeados": dict(sorted(nao_mapeados.items())),
                   "linhasDeTotalIgnoradas": totais_ignorados}
    return acc, descartados


def anexar_populacao(por_periodo: dict[str, dict[str, dict]],
                     populacao: Populacao) -> dict[str, dict[str, dict]]:
    """Novo dict com a população IBGE do ano de cada período."""
    return {
        periodo: {cod: {**m, "populacao": populacao(cod, ano_do_periodo(periodo))}
                  for cod, m in muns.items()}
        for periodo, muns in por_periodo.items()
    }


# ── Agregações ──────────────────────────────────────────────────────────

def taxa_pct(numerador: float | None, denominador: float | None) -> float | None:
    return common.taxa(numerador, denominador, por=100, casas=2)


def build_por_periodo(por_periodo: dict[str, dict[str, dict]]) -> list[dict]:
    """Série estadual: soma dos beneficiários / soma das populações."""
    serie = []
    for periodo, muns in sorted(por_periodo.items()):
        benef = sum(m["beneficiarios"] for m in muns.values())
        medico = sum(m["beneficiarios_medico"] for m in muns.values())
        pop = sum(m["populacao"] or 0 for m in muns.values())
        serie.append({"periodo": periodo, "beneficiarios": benef,
                      "taxa_cobertura": taxa_pct(benef, pop),
                      "taxa_medico": taxa_pct(medico, pop)})
    return serie


def build_por_municipio(muns: dict[str, dict]) -> dict[str, dict]:
    return {cod: {
        "beneficiarios": m["beneficiarios"],
        "beneficiarios_medico": m["beneficiarios_medico"],
        "populacao": m["populacao"],
        "taxa_cobertura": taxa_pct(m["beneficiarios"], m["populacao"]),
        "taxa_medico": taxa_pct(m["beneficiarios_medico"], m["populacao"]),
    } for cod, m in sorted(muns.items())}


def build_por_municipio_ano(por_periodo: dict[str, dict[str, dict]],
                            ) -> dict[str, dict[str, float | None]]:
    """Taxa de cobertura do último período de cada ano, por município."""
    ultimo_do_ano: dict[str, str] = {}
    for periodo in sorted(por_periodo):
        ultimo_do_ano[str(ano_do_periodo(periodo))] = periodo
    out: dict[str, dict[str, float | None]] = {}
    for ano, periodo in sorted(ultimo_do_ano.items()):
        for cod, m in por_periodo[periodo].items():
            out.setdefault(cod, {})[ano] = taxa_pct(m["beneficiarios"], m["populacao"])
    return {cod: dict(out[cod]) for cod in sorted(out)}


# ── Saída ───────────────────────────────────────────────────────────────

def montar_saida(por_periodo: dict[str, dict[str, dict]], descartados: dict,
                 atualizacao: str) -> dict:
    periodos = sorted(por_periodo)
    ultimo = periodos[-1]
    return {
        "metadata": {
            "fonte": FONTE,
            "competencia": ultimo,
            "periodo": f"{periodos[0]}..{ultimo}",
            "atualizacao": atualizacao,
            "descartados": descartados,
            "nota": NOTA,
        },
        "porPeriodo": build_por_periodo(por_periodo),
        "porMunicipio": build_por_municipio(por_periodo[ultimo]),
        "porMunicipioAno": build_por_municipio_ano(por_periodo),
    }


def executar(manifesto: dict, cfg: ConfigAns = CONFIG) -> dict:
    """Baixa, processa e grava planos_saude.json; devolve o novo manifesto."""
    texto = baixar_subconjunto_uf(common.sessao(), cfg)
    linhas = texto.count("\n") - 1
    if linhas <= 0:
        raise FonteIndisponivel(f"ANS: nenhuma linha da UF {cfg.uf} no CSV")
    arquivo = "ans/pda047_pr.csv"
    manifesto = common.registrar_texto(manifesto, arquivo, texto, DESCRICAO, cfg.url,
                                       linhas=linhas)
    por_periodo, descartados = agregar(texto, common.cod6_para_7(), cfg)
    if not por_periodo:
        raise FonteIndisponivel("ANS: nenhum município reconhecido no CSV")
    pop = common.populacao_municipal()
    com_pop = anexar_populacao(por_periodo,
                               lambda cod, ano: common.populacao_de(pop, cod, ano))
    saida = montar_saida(com_pop, descartados, common.alterado_em(manifesto, [arquivo]))
    common.escrever_json(SAIDA, saida)
    ultimo = saida["porPeriodo"][-1]
    log.info("  ANS %s: %s beneficiários, cobertura %s%% (médica %s%%), %d municípios",
             ultimo["periodo"], f"{ultimo['beneficiarios']:,}", ultimo["taxa_cobertura"],
             ultimo["taxa_medico"], len(saida["porMunicipio"]))
    return manifesto
