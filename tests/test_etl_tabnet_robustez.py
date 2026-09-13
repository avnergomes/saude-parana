"""Robustez do parser do TabNet: linhas em branco, truncamento, CRLF e C1."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import tabnet  # noqa: E402
from etl.common import FonteIndisponivel  # noqa: E402

CABECALHO = '"Município";"Cap I";"Cap II";"Total"\n'


def test_parse_csv_ignora_linhas_em_branco_e_para_no_total():
    texto = (CABECALHO + '"410010 Abatiá";1;2;3\n\n'
             '"410020 Adrianópolis";-;5;5\n"Total";1;7;8\n\nFonte: SIM\n')
    registros = tabnet.parse_csv(texto)
    assert [r["cod6"] for r in registros] == ["410010", "410020"]
    assert registros[0]["nome"] == "Abatiá"
    assert registros[1]["Cap I"] is None and registros[1]["Total"] == 5


def test_parse_csv_aceita_crlf_e_controle_c1_dentro_da_celula():
    texto = CABECALHO.replace("\n", "\r\n") + '"410010 Abati";1;2;3\r\n"Total";1;2;3\r\n'
    registros = tabnet.parse_csv(texto)
    assert len(registros) == 1
    assert registros[0]["Total"] == 3


def test_parse_csv_levanta_em_linha_truncada():
    texto = CABECALHO + '"410010 Abatiá";1;2\n"Total";1;2;3\n'
    with pytest.raises(FonteIndisponivel):
        tabnet.parse_csv(texto)


def test_parse_municipios_exige_minimo_de_municipios():
    texto = CABECALHO + '"410010 Abatiá";1;2;3\n"Total";1;2;3\n'
    assert len(tabnet.parse_municipios(texto, minimo=1)) == 1
    with pytest.raises(FonteIndisponivel):
        tabnet.parse_municipios(texto, minimo=2)


def test_normalizar_quebras_garante_lf_final():
    assert tabnet.normalizar_quebras("a\r\nb") == "a\nb\n"
    assert tabnet.normalizar_quebras("a\n") == "a\n"


def test_registrar_brutos_registra_todos_de_uma_vez(tmp_path, monkeypatch):
    from etl import common
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    brutos = [tabnet.Bruto("tabnet/a.csv", "a", "A", "http://a", 1),
              tabnet.Bruto("tabnet/b.csv", "b", "B", "http://b", 2)]
    manifesto = tabnet.registrar_brutos({}, brutos)
    assert sorted(manifesto) == ["tabnet/a.csv", "tabnet/b.csv"]
    assert (tmp_path / "tabnet" / "b.csv").read_text(encoding="utf-8") == "b"
    assert manifesto["tabnet/b.csv"]["linhas"] == 2
