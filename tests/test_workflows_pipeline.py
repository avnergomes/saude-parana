"""Invariantes dos workflows que commitam dados (data-pipeline e cnpj-pipeline)."""
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

WORKFLOWS = Path(__file__).resolve().parent.parent / ".github" / "workflows"


def _job(arquivo: str, job: str) -> dict:
    dados = yaml.safe_load((WORKFLOWS / arquivo).read_text(encoding="utf-8"))
    return dados["jobs"][job]


def _step(job: dict, nome: str) -> dict:
    return next(s for s in job["steps"] if s.get("name") == nome)


def test_preprocess_so_roda_com_download_completo():
    # SIDRA parcial geraria mortalidade.json misturado (óbitos novos, população antiga).
    job = _job("data-pipeline.yml", "process")
    assert _step(job, "Preprocess data").get("if") == "steps.download.outcome == 'success'"


@pytest.mark.parametrize("arquivo,job", [
    ("data-pipeline.yml", "process"),
    ("cnpj-pipeline.yml", "consolidar"),
])
def test_job_que_commita_parte_da_ponta_do_branch(arquivo, job):
    # Na fila do grupo data-commit, o SHA do disparo já pode estar atrasado.
    dados = _job(arquivo, job)
    assert dados["concurrency"]["group"] == "data-commit"
    checkout = _step(dados, "Checkout")
    assert checkout.get("with", {}).get("ref") == "${{ github.ref }}"
