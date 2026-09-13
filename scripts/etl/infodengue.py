# -*- coding: utf-8 -*-
"""
ETL de arboviroses (dengue) por semana epidemiológica e município do Paraná.

Fonte: InfoDengue (Fiocruz/FGV), API `alertcity`, a partir do SINAN com
nowcasting (casos_est) e nível de alerta 1 a 4. Referência: Codeço CT et al.
InfoDengue: a nowcasting system for the surveillance of arboviruses in
Brazil. Rev Epidemiol Sante Publique, 2018.

Uma chamada por município (399), com pausa entre chamadas. Falhas
individuais são toleradas até `tolerancia_falhas` e registradas em
metadata.descartados; acima disso a fonte é considerada indisponível.
Outras doenças (chikungunya, zika) entram por configuração (`doencas`);
a primeira da tupla é a principal e ocupa as chaves de primeiro nível.

Saída: dashboard/public/data/arboviroses.json
Bruto: data/raw/infodengue/<doenca>_pr.json ({geocode: registros semanais});
       se passar do limite de tamanho, só o hash entra no manifesto.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone

import requests

from etl import common
from etl.common import FonteIndisponivel

DOMINIO = "infodengue"
SAIDA = "arboviroses.json"

FONTE = "InfoDengue (Fiocruz/FGV), a partir do SINAN; citar Codeço CT et al. 2018"
NOTA = "casos_est = casos estimados (nowcasting); nível 1 a 4 = alerta"

log = logging.getLogger("etl.infodengue")


@dataclass(frozen=True)
class ConfigInfodengue:
    url: str = "https://info.dengue.mat.br/api/alertcity"
    doencas: tuple[str, ...] = ("dengue",)
    ano_inicio: int = 2024
    # Orçamento de tempo: sem retry na sessão e timeout curto, senão uma fonte
    # travada consome o job inteiro (399 chamadas x retries x timeout).
    timeout: int = 30
    pausa: float = 0.2
    tolerancia_falhas: float = 0.05
    max_falhas_consecutivas: int = 5
    limite_persistencia: int = 5 * 1024 * 1024
    nivel_alerta: int = 3


CONFIG = ConfigInfodengue()


# ── Download ────────────────────────────────────────────────────────────

def url_municipio(cfg: ConfigInfodengue, geocode: str, doenca: str, ano_fim: int) -> str:
    return (f"{cfg.url}?geocode={geocode}&disease={doenca}&format=json"
            f"&ew_start=1&ew_end=53&ey_start={cfg.ano_inicio}&ey_end={ano_fim}")


def baixar_municipio(http: requests.Session, cfg: ConfigInfodengue, geocode: str,
                     doenca: str, ano_fim: int) -> list[dict] | None:
    """Registros semanais do município; None se a chamada falhou ou veio vazia."""
    try:
        resp = http.get(url_municipio(cfg, geocode, doenca, ano_fim), timeout=cfg.timeout)
        resp.raise_for_status()
        dados = resp.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("  InfoDengue %s/%s: %s", doenca, geocode, exc)
        return None
    if not isinstance(dados, list) or not dados:
        log.warning("  InfoDengue %s/%s: resposta vazia", doenca, geocode)
        return None
    return dados


def baixar_doenca(http: requests.Session, cfg: ConfigInfodengue, doenca: str,
                  codigos: list[str], ano_fim: int) -> tuple[dict[str, list[dict]], list[str]]:
    """({geocode: registros}, municípios sem resposta). Aborta cedo se as
    falhas passarem da tolerância, para não gastar minutos numa fonte fora do ar."""
    maximo = int(len(codigos) * cfg.tolerancia_falhas)
    por_municipio: dict[str, list[dict]] = {}
    falhas: list[str] = []
    consecutivas = 0
    for i, cod in enumerate(sorted(codigos), 1):
        dados = baixar_municipio(http, cfg, cod, doenca, ano_fim)
        if dados is None:
            falhas = falhas + [cod]
            consecutivas += 1
            if len(falhas) > maximo or consecutivas >= cfg.max_falhas_consecutivas:
                raise FonteIndisponivel(
                    f"InfoDengue {doenca}: {len(falhas)} municípios sem resposta "
                    f"({consecutivas} seguidos; tolerância {maximo})")
        else:
            consecutivas = 0
            por_municipio[cod] = dados
        if i % 50 == 0 or i == len(codigos):
            log.info("  InfoDengue %s: %d/%d municípios", doenca, i, len(codigos))
        time.sleep(cfg.pausa)
    return por_municipio, falhas


def registrar_bruto(manifesto: dict, cfg: ConfigInfodengue, doenca: str,
                    por_municipio: dict[str, list[dict]], url: str) -> tuple[dict, str]:
    """Registra o bruto combinado; só o hash se passar do limite de tamanho."""
    arquivo = f"infodengue/{doenca}_pr.json"
    texto = json.dumps(por_municipio, ensure_ascii=False, separators=(",", ":"))
    tamanho = len(texto.encode("utf-8"))
    persistir = tamanho <= cfg.limite_persistencia
    if not persistir:
        log.info("  %s: %d MB, acima do limite; só o hash entra no manifesto",
                 arquivo, tamanho >> 20)
    linhas = sum(len(regs) for regs in por_municipio.values())
    novo = common.registrar_texto(
        manifesto, arquivo, texto,
        f"InfoDengue, {doenca}: registros semanais por município do PR", url,
        linhas=linhas, persistir=persistir)
    return novo, arquivo


# ── Processamento ───────────────────────────────────────────────────────

def ano_da_se(se: int) -> int:
    return int(str(se)[:4])


def data_iso(epoch_ms: int | None) -> str | None:
    """data_iniSE (epoch em milissegundos, UTC) -> 'AAAA-MM-DD'."""
    if epoch_ms is None:
        return None
    return datetime.fromtimestamp(int(epoch_ms) / 1000, tz=timezone.utc).date().isoformat()


def filtrar(por_municipio: dict[str, list[dict]], ano_inicio: int) -> dict[str, list[dict]]:
    """Mantém registros com SE >= ano_inicio, ordenados por SE crescente."""
    return {
        cod: sorted((r for r in regs if ano_da_se(int(r["SE"])) >= ano_inicio),
                    key=lambda r: int(r["SE"]))
        for cod, regs in sorted(por_municipio.items())
    }


def pop_de(regs: list[dict]) -> int:
    """População do município (campo `pop`, texto na API) do registro mais recente."""
    for r in reversed(regs):
        try:
            return int(float(r.get("pop") or 0))
        except (TypeError, ValueError):
            continue
    return 0


def casos_por_ano(regs: list[dict]) -> dict[int, dict[str, float]]:
    """{ano: {"casos", "casos_est"}} de um município."""
    acc: dict[int, dict[str, float]] = {}
    for r in regs:
        ano = acc.setdefault(ano_da_se(int(r["SE"])), {"casos": 0, "casos_est": 0.0})
        ano["casos"] += int(r.get("casos") or 0)
        ano["casos_est"] += float(r.get("casos_est") or 0)
    return acc


def build_por_semana(por_municipio: dict[str, list[dict]], nivel_alerta: int) -> list[dict]:
    """Somas estaduais por SE, crescente, com contagem de municípios em alerta."""
    acc: dict[int, dict] = {}
    for regs in por_municipio.values():
        for r in regs:
            se = int(r["SE"])
            s = acc.setdefault(se, {"inicio": data_iso(r.get("data_iniSE")),
                                    "casos_est": 0.0, "casos": 0, "alerta": 0})
            s["casos_est"] += float(r.get("casos_est") or 0)
            s["casos"] += int(r.get("casos") or 0)
            s["alerta"] += 1 if int(r.get("nivel") or 0) >= nivel_alerta else 0
    return [{"semana": str(se), "inicio": s["inicio"], "casos_est": round(s["casos_est"]),
             "casos": s["casos"], "municipiosAlerta": s["alerta"]}
            for se, s in sorted(acc.items())]


def build_por_ano(por_municipio: dict[str, list[dict]]) -> list[dict]:
    """Série estadual anual; incidência por 100 mil com a soma das populações."""
    acc: dict[int, dict[str, float]] = {}
    for regs in por_municipio.values():
        pop = pop_de(regs)
        for ano, v in casos_por_ano(regs).items():
            a = acc.setdefault(ano, {"casos": 0, "casos_est": 0.0, "pop": 0})
            a["casos"] += v["casos"]
            a["casos_est"] += v["casos_est"]
            a["pop"] += pop
    return [{"ano": ano, "casos": int(a["casos"]), "casos_est": round(a["casos_est"]),
             "incidencia_100k": common.taxa(a["casos"], a["pop"], por=100_000, casas=1)}
            for ano, a in sorted(acc.items())]


def build_por_municipio(por_municipio: dict[str, list[dict]], ano_ref: int) -> dict[str, dict]:
    """Recorte municipal do ano de referência (acumulado até a última SE)."""
    out: dict[str, dict] = {}
    for cod in sorted(por_municipio):
        regs = por_municipio[cod]
        pop = pop_de(regs)
        ano = casos_por_ano(regs).get(ano_ref, {"casos": 0, "casos_est": 0.0})
        ultimo = regs[-1] if regs else {}
        out[cod] = {
            "casos_ano": int(ano["casos"]),
            "casos_est_ano": round(ano["casos_est"]),
            "incidencia_100k": common.taxa(ano["casos"], pop, por=100_000, casas=1),
            "nivel": ultimo.get("nivel"),
            "pop": pop,
        }
    return out


def build_por_municipio_ano(por_municipio: dict[str, list[dict]]) -> dict[str, dict[str, int]]:
    return {cod: {str(ano): int(v["casos"])
                  for ano, v in sorted(casos_por_ano(por_municipio[cod]).items())}
            for cod in sorted(por_municipio)}


def processar_doenca(por_municipio: dict[str, list[dict]], cfg: ConfigInfodengue) -> dict:
    """Blocos de saída de uma doença (sem metadata)."""
    filtrado = filtrar(por_municipio, cfg.ano_inicio)
    semanas = sorted({int(r["SE"]) for regs in filtrado.values() for r in regs})
    if not semanas:
        raise FonteIndisponivel("InfoDengue: nenhuma semana epidemiológica no período")
    ano_ref = ano_da_se(semanas[-1])
    return {
        "periodo": f"{str(semanas[0])[:4]}-{str(semanas[0])[4:]}.."
                   f"{str(semanas[-1])[:4]}-{str(semanas[-1])[4:]}",
        "semanaUltima": str(semanas[-1]),
        "porSemana": build_por_semana(filtrado, cfg.nivel_alerta),
        "porAno": build_por_ano(filtrado),
        "porMunicipio": build_por_municipio(filtrado, ano_ref),
        "porMunicipioAno": build_por_municipio_ano(filtrado),
        "anoReferencia": ano_ref,
    }


# ── Saída ───────────────────────────────────────────────────────────────

def montar_saida(resultados: dict[str, dict], falhas: dict[str, list[str]],
                 cfg: ConfigInfodengue, atualizacao: str) -> dict:
    """Doença principal nas chaves de primeiro nível; demais em `outrasDoencas`."""
    principal = cfg.doencas[0]
    r = resultados[principal]
    saida = {
        "metadata": {
            "fonte": FONTE,
            "doencas": list(cfg.doencas),
            "periodo": r["periodo"],
            "semanaUltima": r["semanaUltima"],
            "atualizacao": atualizacao,
            "descartados": {"municipiosSemResposta": falhas[principal]},
            "nota": NOTA,
        },
        "porSemana": r["porSemana"],
        "porAno": r["porAno"],
        "porMunicipio": r["porMunicipio"],
        "porMunicipioAno": r["porMunicipioAno"],
        "anoReferencia": r["anoReferencia"],
    }
    outras = {d: {**resultados[d], "descartados": {"municipiosSemResposta": falhas[d]}}
              for d in cfg.doencas[1:]}
    return {**saida, "outrasDoencas": outras} if outras else saida


def executar(manifesto: dict, cfg: ConfigInfodengue = CONFIG,
             hoje: date | None = None) -> dict:
    """Baixa, processa e grava arboviroses.json; devolve o novo manifesto."""
    ano_fim = (hoje or date.today()).year
    codigos = sorted(common.geo_municipios())
    http = common.sessao(tentativas=1)
    resultados: dict[str, dict] = {}
    falhas: dict[str, list[str]] = {}
    arquivos: list[str] = []
    for doenca in cfg.doencas:
        por_municipio, falhas_doenca = baixar_doenca(http, cfg, doenca, codigos, ano_fim)
        url_modelo = url_municipio(cfg, "<geocode>", doenca, ano_fim)
        manifesto, arquivo = registrar_bruto(manifesto, cfg, doenca, por_municipio, url_modelo)
        resultados[doenca] = processar_doenca(por_municipio, cfg)
        falhas[doenca] = falhas_doenca
        arquivos = arquivos + [arquivo]
    saida = montar_saida(resultados, falhas, cfg, common.alterado_em(manifesto, arquivos))
    common.escrever_json(SAIDA, saida)
    ultimo = saida["porAno"][-1]
    log.info("  InfoDengue %s: %d municípios, SE %s, %d casos em %d (%s/100 mil); "
             "sem resposta: %d", cfg.doencas[0], len(saida["porMunicipio"]),
             saida["metadata"]["semanaUltima"], ultimo["casos"], ultimo["ano"],
             ultimo["incidencia_100k"], len(falhas[cfg.doencas[0]]))
    return manifesto
