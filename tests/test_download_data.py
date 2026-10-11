"""Testes do download (sem rede): manifesto, guarda de truncamento e parsing.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import download_data as dl  # noqa: E402
import preprocess_data as pp  # noqa: E402


def test_serializacao_canonica_preserva_utf8():
    rows = [{"V": "1", "D1N": "Abatiá - PR"}]
    assert dl.serializar(rows) == '[{"V": "1", "D1N": "Abatiá - PR"}]'


def test_sha256_texto_e_deterministico_e_sensivel_ao_conteudo():
    assert dl.sha256_texto("abc") == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
    assert dl.sha256_texto("abc") != dl.sha256_texto("abd")


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


def test_registrar_regrava_arquivo_sumido_sem_avancar_a_data(tmp_path, monkeypatch):
    monkeypatch.setattr(dl, "RAW_DIR", tmp_path)
    consulta = dl.Consulta("x.json", "http://exemplo", "teste")
    m1 = dl.registrar({}, consulta, [{"V": "1"}])
    antigo = {"x.json": {**m1["x.json"], "alterado_em": "2020-01-01"}}
    (tmp_path / "x.json").unlink()

    m2 = dl.registrar(antigo, consulta, [{"V": "1"}])
    assert (tmp_path / "x.json").exists()
    assert m2["x.json"]["alterado_em"] == "2020-01-01"


def test_encolheu_detecta_resposta_truncada():
    consulta = dl.Consulta("x.json", "http://exemplo", "teste")
    manifesto = {"x.json": {"linhas": 1000}}
    assert dl.encolheu(manifesto, consulta, [{}] * 900) is True
    assert dl.encolheu(manifesto, consulta, [{}] * 960) is False
    assert dl.encolheu(manifesto, consulta, [{}] * 1200) is False
    # Sem histórico nada é considerado truncado
    assert dl.encolheu({}, consulta, [{}] * 3) is False


class _Resposta:
    def __init__(self, corpo):
        self._corpo = corpo

    def raise_for_status(self):
        return None

    def json(self):
        return self._corpo


def test_fetch_sidra_rejeita_corpo_que_nao_e_lista(monkeypatch):
    chamadas = []
    monkeypatch.setattr(dl.time, "sleep", lambda _s: None)
    monkeypatch.setattr(dl.requests, "get",
                        lambda *a, **k: chamadas.append(1) or _Resposta({"erro": "x"}))
    assert dl.fetch_sidra("http://exemplo", "teste") == []
    assert len(chamadas) == dl.TENTATIVAS


def test_fetch_sidra_descarta_cabecalho(monkeypatch):
    monkeypatch.setattr(dl.requests, "get",
                        lambda *a, **k: _Resposta([{"V": "Valor"}, {"V": "1"}]))
    assert dl.fetch_sidra("http://exemplo", "teste") == [{"V": "1"}]


def test_consultas_cobrem_todos_os_arquivos_do_preprocess():
    arquivos = {c.arquivo for c in dl.CONSULTAS}
    esperados = {"obitos_municipios_pr.json", "obitos_piramide_pr.json",
                 "nascidos_municipios_pr.json"} | set(pp.ARQUIVOS_POPULACAO)
    assert esperados <= arquivos


def _rodar_main(tmp_path, monkeypatch, respostas: dict) -> int:
    monkeypatch.setattr(dl, "RAW_DIR", tmp_path)
    monkeypatch.setattr(dl, "MANIFEST_PATH", tmp_path / "_manifest.json")
    monkeypatch.setattr(dl.time, "sleep", lambda _s: None)
    monkeypatch.setattr(dl, "CONSULTAS", tuple(dl.Consulta(a, f"http://{a}", "teste") for a in respostas))
    monkeypatch.setattr(dl, "fetch_sidra", lambda url, _d: respostas[url.removeprefix("http://")])
    monkeypatch.setattr(sys, "argv", ["download_data.py"])
    return dl.main()


def test_main_falha_parcial_nao_grava_bruto_truncado_e_sai_com_1(tmp_path, monkeypatch):
    anteriores = {"vazio.json": [{"V": "São José"}] * 100, "truncado.json": [{"V": "Açaí"}] * 100}
    manifesto = {}
    for arquivo, rows in anteriores.items():
        monkeypatch.setattr(dl, "RAW_DIR", tmp_path)
        manifesto = dl.registrar(manifesto, dl.Consulta(arquivo, f"http://{arquivo}", "teste"), rows)
    (tmp_path / "_manifest.json").write_text(json.dumps(manifesto, ensure_ascii=False), encoding="utf-8")
    bytes_antes = {a: (tmp_path / a).read_bytes() for a in anteriores}

    codigo = _rodar_main(tmp_path, monkeypatch, {
        "ok.json": [{"V": "Maringá"}],
        "vazio.json": [],  # todas as tentativas falharam
        "truncado.json": [{"V": "Açaí"}] * 50,  # encolheu além do limiar
    })

    assert codigo == 1
    assert json.loads((tmp_path / "ok.json").read_text(encoding="utf-8")) == [{"V": "Maringá"}]
    for arquivo, conteudo in bytes_antes.items():
        assert (tmp_path / arquivo).read_bytes() == conteudo
    novo = json.loads((tmp_path / "_manifest.json").read_text(encoding="utf-8"))
    assert {a: novo[a] for a in anteriores} == {a: manifesto[a] for a in anteriores}
    assert "ok.json" in novo
    assert not list(tmp_path.glob("*.tmp"))


def test_main_sai_com_0_quando_todas_as_consultas_dao_certo(tmp_path, monkeypatch):
    assert _rodar_main(tmp_path, monkeypatch, {"a.json": [{"V": "1"}], "b.json": [{"V": "2"}]}) == 0
    assert (tmp_path / "a.json").exists() and (tmp_path / "b.json").exists()


def test_registrar_escrita_interrompida_nao_trunca_o_bruto(tmp_path, monkeypatch):
    monkeypatch.setattr(dl, "RAW_DIR", tmp_path)
    consulta = dl.Consulta("x.json", "http://exemplo", "teste")
    m1 = dl.registrar({}, consulta, [{"V": "Cascavel"}])
    antes = (tmp_path / "x.json").read_bytes()

    def morre(*_a, **_k):
        raise OSError("job morto no meio da escrita")

    monkeypatch.setattr(dl.os, "replace", morre)
    with pytest.raises(OSError):
        dl.registrar(m1, consulta, [{"V": "Foz do Iguaçu"}])
    assert (tmp_path / "x.json").read_bytes() == antes
