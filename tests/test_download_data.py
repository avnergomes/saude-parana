"""Testes do manifesto de mudanças do download (sem rede).

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import download_data as dl  # noqa: E402


def test_serializacao_canonica_preserva_utf8_e_hash_estavel():
    rows = [{"V": "1", "D1N": "Abatiá - PR"}]
    assert dl.serializar(rows) == '[{"V": "1", "D1N": "Abatiá - PR"}]'
    assert dl.sha256_texto(dl.serializar(rows)) == dl.sha256_texto(dl.serializar(list(rows)))


def test_registrar_grava_so_quando_conteudo_muda(tmp_path, monkeypatch):
    monkeypatch.setattr(dl, "RAW_DIR", tmp_path)
    consulta = dl.Consulta("x.json", "http://exemplo", "teste")
    rows = [{"V": "1"}]

    m1 = dl.registrar({}, consulta, rows)
    assert (tmp_path / "x.json").read_text(encoding="utf-8") == dl.serializar(rows)
    hoje = m1["x.json"]["alterado_em"]

    # Mesmo conteúdo: preserva a data antiga e não muta o manifesto anterior
    manifesto_antigo = {"x.json": {**m1["x.json"], "alterado_em": "2020-01-01"}}
    m2 = dl.registrar(manifesto_antigo, consulta, rows)
    assert m2["x.json"]["alterado_em"] == "2020-01-01"
    assert manifesto_antigo["x.json"]["alterado_em"] == "2020-01-01"

    # Conteúdo novo: reescreve o arquivo e atualiza a data
    m3 = dl.registrar(m2, consulta, [{"V": "2"}])
    assert m3["x.json"]["sha256"] != m2["x.json"]["sha256"]
    assert m3["x.json"]["alterado_em"] == hoje
    assert json.loads((tmp_path / "x.json").read_text(encoding="utf-8")) == [{"V": "2"}]


def test_registrar_regrava_se_arquivo_sumiu(tmp_path, monkeypatch):
    monkeypatch.setattr(dl, "RAW_DIR", tmp_path)
    consulta = dl.Consulta("x.json", "http://exemplo", "teste")
    m1 = dl.registrar({}, consulta, [{"V": "1"}])
    (tmp_path / "x.json").unlink()
    dl.registrar(m1, consulta, [{"V": "1"}])
    assert (tmp_path / "x.json").exists()


def test_consultas_cobrem_todos_os_arquivos_do_preprocess():
    arquivos = {c.arquivo for c in dl.CONSULTAS}
    assert {
        "obitos_municipios_pr.json", "obitos_piramide_pr.json",
        "nascidos_municipios_pr.json", "populacao_anos_pr.json",
        "populacao_censo_2007_pr.json", "populacao_censo_2010_pr.json",
        "populacao_censo_2022_pr.json",
    } <= arquivos
