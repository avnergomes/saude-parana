"""Testes do download (sem rede): manifesto, guarda de truncamento e parsing.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

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
