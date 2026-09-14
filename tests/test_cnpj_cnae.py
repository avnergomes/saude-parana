# -*- coding: utf-8 -*-
"""Testes da classificação de CNAE da camada CNPJ (sem rede)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cnpj import cnae  # noqa: E402


def test_grupo_de_cobre_todas_as_classes_da_divisao_86():
    assert cnae.grupo_de("8610101") == "hospitais"
    assert cnae.grupo_de("8610102") == "hospitais"
    assert cnae.grupo_de("8621601") == "urgencia_remocao"
    assert cnae.grupo_de("8622400") == "urgencia_remocao"
    assert cnae.grupo_de("8630504") == "clinicas_consultorios"
    assert cnae.grupo_de("8630599") == "clinicas_consultorios"
    assert cnae.grupo_de("8640214") == "diagnostico"
    assert cnae.grupo_de("8650099") == "profissionais_saude"
    assert cnae.grupo_de("8660700") == "apoio_gestao"
    assert cnae.grupo_de("8690999") == "outras_saude"


def test_grupo_de_farmacias_inclui_01_a_03_e_exclui_veterinaria():
    assert cnae.grupo_de("4771701") == "farmacias"
    assert cnae.grupo_de("4771702") == "farmacias"
    assert cnae.grupo_de("4771703") == "farmacias"
    assert cnae.grupo_de("4771704") is None
    assert cnae.eh_saude("4771704") is False
    assert cnae.eh_saude("4771701") is True


def test_grupo_de_rejeita_o_que_nao_e_saude_ou_e_malformado():
    assert cnae.grupo_de("8599699") is None  # educação
    assert cnae.grupo_de("4711302") is None  # supermercado
    assert cnae.grupo_de("") is None
    assert cnae.grupo_de("863050") is None  # 6 dígitos
    assert cnae.grupo_de("86305041") is None  # 8 dígitos
    assert cnae.grupo_de("86") is None


def test_grupo_de_aceita_pontuacao_e_espacos():
    assert cnae.grupo_de("8630-5/04") == "clinicas_consultorios"
    assert cnae.grupo_de(" 4771701 ") == "farmacias"


def test_secundarias_saude_lida_com_espacos_vazios_e_repeticoes():
    assert cnae.secundarias_saude(" 8630504, 4771704 ,, 8599699,8630504 ,8650001") == (
        "8630504", "8650001")
    assert cnae.secundarias_saude("") == ()
    assert cnae.secundarias_saude("4771704") == ()
    assert cnae.secundarias_saude("8599699,4711302") == ()


def test_grupos_sem_sobreposicao_e_nomes_com_acento():
    classes = [c for g in cnae.GRUPOS for c in g.classes]
    assert len(classes) == len(set(classes))
    assert len(cnae.CODIGOS) == 8
    assert cnae.CODIGOS[-1] == "farmacias"
    assert cnae.NOMES["farmacias"] == "Farmácias e drogarias (4771-7)"
    assert cnae.NOMES["urgencia_remocao"].startswith("Urgência")
    assert cnae.NOMES["diagnostico"] == "Diagnóstico e terapia (8640-2)"


def test_contar_grupos_lista_todos_e_ordena_por_ativos_desc():
    grupos = cnae.contar_grupos({"farmacias": 5, "hospitais": 2, "clinicas_consultorios": 5})
    assert [g["codigo"] for g in grupos[:3]] == ["clinicas_consultorios", "farmacias", "hospitais"]
    assert {g["codigo"] for g in grupos} == set(cnae.CODIGOS)
    assert grupos[0] == {"codigo": "clinicas_consultorios",
                         "nome": "Clínicas e consultórios médicos e odontológicos (8630-5)",
                         "ativos": 5}
    assert all(g["ativos"] == 0 for g in grupos[3:])
    assert [g["codigo"] for g in grupos[3:]] == ["urgencia_remocao", "diagnostico",
                                                  "profissionais_saude", "apoio_gestao",
                                                  "outras_saude"]
