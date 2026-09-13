# -*- coding: utf-8 -*-
"""
Utilidades compartilhadas dos ETLs de domínio (scripts/etl/*).

Convenções:
- Saídas em dashboard/public/data/<SAIDA>, JSON minificado, UTF-8 e
  determinístico (mesma entrada => mesmos bytes; sem timestamps de relógio).
- Brutos pequenos (CSV/JSON) ficam em data/raw e entram no manifesto
  (_manifest.json: sha256 + data da última mudança real). Brutos grandes
  (zips) também ficam em data/raw, mas são ignorados pelo git; só o hash
  entra no manifesto.
- A data "atualizacao" de cada saída vem do manifesto (alterado_em), não
  do relógio, para que o pipeline só comite quando os dados mudarem.
"""

from __future__ import annotations

import hashlib
import json
import logging
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_DIR = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = BASE_DIR / "scripts"
RAW_DIR = BASE_DIR / "data" / "raw"
PUBLIC_DATA_DIR = BASE_DIR / "dashboard" / "public" / "data"
MANIFEST_PATH = RAW_DIR / "_manifest.json"

USER_AGENT = (
    "Mozilla/5.0 (compatible; saude-parana/2.1; "
    "+https://github.com/avnergomes/saude-parana)"
)

log = logging.getLogger("etl")


class FonteIndisponivel(RuntimeError):
    """A fonte oficial não respondeu de forma utilizável."""


# ── HTTP ────────────────────────────────────────────────────────────────

def sessao(tentativas: int = 3, backoff: float = 2.0) -> requests.Session:
    """Sessão HTTP com retry exponencial para 429/5xx (GET e POST)."""
    retry = Retry(
        total=tentativas,
        backoff_factor=backoff,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        raise_on_status=False,
    )
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    return s


@dataclass(frozen=True)
class Download:
    caminho: Path
    ultima_modificacao: str | None  # cabeçalho Last-Modified, se houver
    tamanho: int


def baixar_arquivo(url: str, destino: Path, timeout: int = 300,
                   http: requests.Session | None = None) -> Download:
    """Baixa em streaming para `destino`; levanta FonteIndisponivel se falhar."""
    http = http or sessao()
    destino.parent.mkdir(parents=True, exist_ok=True)
    try:
        with http.get(url, stream=True, timeout=timeout) as resp:
            resp.raise_for_status()
            with open(destino, "wb") as f:
                for pedaco in resp.iter_content(chunk_size=1 << 20):
                    f.write(pedaco)
            ultima = resp.headers.get("Last-Modified")
    except requests.RequestException as exc:
        raise FonteIndisponivel(f"falha ao baixar {url}: {exc}") from exc
    tamanho = destino.stat().st_size
    log.info("  baixado: %s (%d KB)", destino.name, tamanho // 1024)
    return Download(destino, ultima, tamanho)


# ── Manifesto ───────────────────────────────────────────────────────────

def sha256_texto(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def sha256_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for pedaco in iter(lambda: f.read(1 << 20), b""):
            h.update(pedaco)
    return h.hexdigest()


def carregar_manifesto() -> dict:
    if not MANIFEST_PATH.exists():
        return {}
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def salvar_manifesto(manifesto: dict) -> None:
    MANIFEST_PATH.write_text(
        json.dumps(manifesto, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _entrada(anterior: dict, digest: str, descricao: str, url: str,
             linhas: int | None, inalterado: bool) -> dict:
    hoje = date.today().isoformat()
    return {
        "descricao": descricao,
        "url": url,
        "linhas": linhas,
        "sha256": digest,
        "alterado_em": (anterior.get("alterado_em") or hoje) if inalterado else hoje,
    }


def registrar_texto(manifesto: dict, arquivo: str, texto: str, descricao: str,
                    url: str, linhas: int | None = None, persistir: bool = True) -> dict:
    """Registra um bruto textual; grava data/raw/<arquivo> só se mudou.
    Devolve um novo manifesto (o de entrada não é mutado)."""
    digest = sha256_texto(texto)
    destino = RAW_DIR / arquivo
    anterior = manifesto.get(arquivo, {})
    mudou = anterior.get("sha256") != digest
    # Regrava se mudou ou se o arquivo sumiu do disco; a data só avança se mudou.
    if persistir and (mudou or not destino.exists()):
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(texto, encoding="utf-8")
        log.info("  gravado: %s (%d KB)", arquivo, len(texto.encode("utf-8")) // 1024)
    elif not mudou:
        log.info("  sem mudança: %s", arquivo)
    return {**manifesto, arquivo: _entrada(anterior, digest, descricao, url, linhas, not mudou)}


def registrar_hash(manifesto: dict, arquivo: str, digest: str, descricao: str,
                   url: str, linhas: int | None = None) -> dict:
    """Registra só o hash de um bruto grande (zip ignorado pelo git)."""
    anterior = manifesto.get(arquivo, {})
    inalterado = anterior.get("sha256") == digest
    return {**manifesto, arquivo: _entrada(anterior, digest, descricao, url, linhas, inalterado)}


def alterado_em(manifesto: dict, arquivos: list[str]) -> str:
    """Data da última mudança real entre os brutos informados (ou hoje)."""
    datas = [manifesto.get(a, {}).get("alterado_em") for a in arquivos]
    datas = [d for d in datas if d]
    return max(datas) if datas else date.today().isoformat()


# ── Território e população ──────────────────────────────────────────────

def geo_municipios() -> dict[str, dict]:
    """cod_ibge(7) -> {"nome", "regional"} a partir do geo_map.json versionado."""
    geo_map = json.loads((PUBLIC_DATA_DIR / "geo_map.json").read_text(encoding="utf-8"))
    return {
        str(m["cod_ibge"]): {"nome": m["nome"], "regional": regional}
        for regional, municipios in geo_map["municipiosPorRegional"].items()
        for m in municipios
    }


def cod6_para_7() -> dict[str, str]:
    """Mapa código IBGE de 6 dígitos (CNES/TabNet) -> 7 dígitos (dashboard)."""
    return {cod[:6]: cod for cod in geo_municipios()}


def populacao_municipal() -> dict[str, dict[int, int]]:
    """cod_ibge(7) -> {ano -> população} (estimativas + censos já baixados)."""
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    import preprocess_data as pp  # noqa: PLC0415  (reuso das funções do preprocess)

    fontes = [pp.load_raw(nome, obrigatorio=False) for nome in pp.ARQUIVOS_POPULACAO]
    return pp.build_populacao(fontes)


def populacao_de(pop: dict, cod7: str, ano: int) -> int | None:
    """População do município no ano (interpolada/mais próxima se faltar)."""
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    import preprocess_data as pp  # noqa: PLC0415

    valor, _interpolado = pp.populacao_de(pop, cod7, ano)
    return valor


def taxa(numerador: float | None, denominador: float | None, por: int = 1000,
         casas: int = 2) -> float | None:
    if numerador is None or not denominador:
        return None
    return round(numerador / denominador * por, casas)


# ── Saída ───────────────────────────────────────────────────────────────

def escrever_json(nome: str, obj: dict) -> Path:
    """Grava JSON minificado, UTF-8, chaves na ordem de inserção (determinístico)."""
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    destino = PUBLIC_DATA_DIR / nome
    destino.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf-8")
    log.info("  Salvo: %s (%d KB)", nome, destino.stat().st_size // 1024)
    return destino
