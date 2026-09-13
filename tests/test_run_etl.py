"""Testes do orquestrador: isolamento de falhas por domínio."""

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import run_etl  # noqa: E402
from etl import common  # noqa: E402


def _modulo_falso(nome: str, executar):
    mod = types.ModuleType(f"etl.{nome}")
    mod.DOMINIO = nome
    mod.SAIDA = f"{nome}.json"
    mod.executar = executar
    return mod


def test_dominio_com_sucesso_devolve_manifesto_novo(monkeypatch):
    mod = _modulo_falso("ok", lambda m: {**m, "ok.csv": {"sha256": "1"}})
    monkeypatch.setitem(sys.modules, "etl.ok", mod)
    manifesto, sucesso = run_etl.executar_dominio("ok", {"a": {}})
    assert sucesso is True
    assert manifesto == {"a": {}, "ok.csv": {"sha256": "1"}}


def test_falha_com_saida_anterior_mantem_saida_e_manifesto(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path)
    (tmp_path / "quebra.json").write_text("{}", encoding="utf-8")

    def executar(_m):
        raise common.FonteIndisponivel("fora do ar")

    monkeypatch.setitem(sys.modules, "etl.quebra", _modulo_falso("quebra", executar))
    manifesto, sucesso = run_etl.executar_dominio("quebra", {"a": {}})
    assert sucesso is True
    assert manifesto == {"a": {}}
    assert (tmp_path / "quebra.json").read_text(encoding="utf-8") == "{}"


def test_falha_sem_saida_anterior_e_reportada(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path)

    def executar(_m):
        raise RuntimeError("bug")

    monkeypatch.setitem(sys.modules, "etl.novo", _modulo_falso("novo", executar))
    _manifesto, sucesso = run_etl.executar_dominio("novo", {})
    assert sucesso is False


def test_modulo_inexistente_e_pulado_mas_dependencia_ausente_e_falha(monkeypatch):
    _manifesto, sucesso = run_etl.executar_dominio("inexistente", {})
    assert sucesso is True

    mod = types.ModuleType("etl.dep")

    def executar(_m):
        return _m

    mod.executar = executar
    mod.SAIDA = "dep.json"
    monkeypatch.setitem(sys.modules, "etl.dep", mod)

    def importar(nome):
        raise ModuleNotFoundError("No module named 'biblioteca_x'", name="biblioteca_x")

    monkeypatch.setattr(run_etl.importlib, "import_module", importar)
    _manifesto, sucesso = run_etl.executar_dominio("dep", {})
    assert sucesso is False
