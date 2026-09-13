"""Testes das utilidades compartilhadas dos ETLs (manifesto e escrita atômica)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import common  # noqa: E402


def test_registrar_texto_grava_so_quando_muda_e_preserva_a_data(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    m1 = common.registrar_texto({}, "x/a.csv", "conteúdo ã", "desc", "http://u", linhas=3)
    assert (tmp_path / "x" / "a.csv").read_text(encoding="utf-8") == "conteúdo ã"
    assert m1["x/a.csv"]["linhas"] == 3

    antigo = {"x/a.csv": {**m1["x/a.csv"], "alterado_em": "2020-01-01"}}
    m2 = common.registrar_texto(antigo, "x/a.csv", "conteúdo ã", "desc", "http://u")
    assert m2["x/a.csv"]["alterado_em"] == "2020-01-01"
    assert antigo["x/a.csv"]["alterado_em"] == "2020-01-01"  # sem mutação

    m3 = common.registrar_texto(m2, "x/a.csv", "novo", "desc", "http://u")
    assert m3["x/a.csv"]["alterado_em"] != "2020-01-01"
    assert (tmp_path / "x" / "a.csv").read_text(encoding="utf-8") == "novo"


def test_registrar_texto_regrava_arquivo_sumido_sem_avancar_a_data(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    m1 = common.registrar_texto({}, "a.csv", "t", "desc", "http://u")
    antigo = {"a.csv": {**m1["a.csv"], "alterado_em": "2020-01-01"}}
    (tmp_path / "a.csv").unlink()
    m2 = common.registrar_texto(antigo, "a.csv", "t", "desc", "http://u")
    assert (tmp_path / "a.csv").exists()
    assert m2["a.csv"]["alterado_em"] == "2020-01-01"


def test_registrar_texto_sem_persistir_guarda_so_o_hash(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    m = common.registrar_texto({}, "grande.json", "x" * 10, "desc", "http://u", persistir=False)
    assert not (tmp_path / "grande.json").exists()
    assert m["grande.json"]["sha256"] == common.sha256_texto("x" * 10)
    antigo = {"grande.json": {**m["grande.json"], "alterado_em": "2021-05-05"}}
    m2 = common.registrar_texto(antigo, "grande.json", "x" * 10, "desc", "http://u",
                                persistir=False)
    assert m2["grande.json"]["alterado_em"] == "2021-05-05"


def test_registrar_hash_e_alterado_em():
    m1 = common.registrar_hash({}, "z.zip", "abc", "desc", "http://u", linhas=1)
    antigo = {"z.zip": {**m1["z.zip"], "alterado_em": "2019-09-09"},
              "w.csv": {"alterado_em": "2022-02-02"}}
    m2 = common.registrar_hash(antigo, "z.zip", "abc", "desc", "http://u")
    assert m2["z.zip"]["alterado_em"] == "2019-09-09"
    assert common.alterado_em(m2, ["z.zip", "w.csv"]) == "2022-02-02"
    assert common.alterado_em({}, ["nada"]) == common.date.today().isoformat()


def test_escrever_json_e_manifesto_sao_atomicos_e_utf8(tmp_path, monkeypatch):
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "pub")
    monkeypatch.setattr(common, "MANIFEST_PATH", tmp_path / "raw" / "_manifest.json")
    destino = common.escrever_json("s.json", {"município": "Abatiá", "n": 1})
    assert json.loads(destino.read_text(encoding="utf-8")) == {"município": "Abatiá", "n": 1}
    assert not destino.with_name("s.json.tmp").exists()
    common.salvar_manifesto({"b": {"sha256": "1"}, "a": {"sha256": "2"}})
    texto = (tmp_path / "raw" / "_manifest.json").read_text(encoding="utf-8")
    assert texto.index('"a"') < texto.index('"b"')  # sort_keys: determinístico
    assert texto.endswith("\n")


def test_taxa_guarda_divisao_por_zero_e_nulos():
    assert common.taxa(10, 1000) == 10.0
    assert common.taxa(10, 0) is None
    assert common.taxa(None, 1000) is None
    assert common.taxa(1, 3, por=100, casas=1) == 33.3
