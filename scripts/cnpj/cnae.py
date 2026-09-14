# -*- coding: utf-8 -*-
"""
Classificação de CNAE fiscal para a camada CNPJ.

Critério de saúde: divisão 86 (atividades de atenção à saúde humana) ou
farmácias e drogarias (subclasses 4771-7/01 a 03; a 4771-7/04, comércio
varejista de medicamentos veterinários, fica de fora). Os códigos chegam da
Receita com 7 dígitos sem pontuação (ex.: 8630504); o grupo de um
estabelecimento é a classe (5 primeiros dígitos) do CNAE principal.

Subclasses verificadas na API do IBGE em 13/09/2026
(https://servicodados.ibge.gov.br/api/v2/cnae/classes/{classe}/subclasses).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Grupo:
    codigo: str
    nome: str
    classes: tuple[str, ...]  # classes CNAE de 5 dígitos


GRUPOS: tuple[Grupo, ...] = (
    Grupo("hospitais", "Hospitais (8610-1)", ("86101",)),
    Grupo("urgencia_remocao", "Urgência móvel e remoção (8621-6, 8622-4)", ("86216", "86224")),
    Grupo("clinicas_consultorios",
          "Clínicas e consultórios médicos e odontológicos (8630-5)", ("86305",)),
    Grupo("diagnostico", "Diagnóstico e terapia (8640-2)", ("86402",)),
    Grupo("profissionais_saude", "Outros profissionais de saúde (8650-0)", ("86500",)),
    Grupo("apoio_gestao", "Apoio à gestão de saúde (8660-7)", ("86607",)),
    Grupo("outras_saude", "Outras atividades de atenção à saúde (8690-9)", ("86909",)),
    Grupo("farmacias", "Farmácias e drogarias (4771-7)", ("47717",)),
)

CODIGOS: tuple[str, ...] = tuple(g.codigo for g in GRUPOS)
NOMES: dict[str, str] = {g.codigo: g.nome for g in GRUPOS}
CLASSE_GRUPO: dict[str, str] = {c: g.codigo for g in GRUPOS for c in g.classes}

DIVISAO_SAUDE = "86"
GRUPO_DIVISAO_SEM_CLASSE = "outras_saude"  # classe nova da divisão 86 ainda não listada
SUBCLASSES_FARMACIA: frozenset[str] = frozenset({"4771701", "4771702", "4771703"})
SUBCLASSE_VETERINARIA = "4771704"  # excluída de propósito
TAMANHO_SUBCLASSE = 7


def normalizar(cnae: str) -> str:
    """Só os dígitos (aceita '8630-5/04', ' 8630504 ' etc.)."""
    return "".join(ch for ch in cnae if ch.isdigit())


def grupo_de(cnae: str) -> str | None:
    """Código do grupo de saúde do CNAE, ou None se não for saúde."""
    codigo = normalizar(cnae)
    if len(codigo) != TAMANHO_SUBCLASSE:
        return None
    if codigo in SUBCLASSES_FARMACIA:
        return "farmacias"
    if not codigo.startswith(DIVISAO_SAUDE):
        return None
    return CLASSE_GRUPO.get(codigo[:5], GRUPO_DIVISAO_SEM_CLASSE)


def eh_saude(cnae: str) -> bool:
    return grupo_de(cnae) is not None


def secundarias_saude(texto: str) -> tuple[str, ...]:
    """CNAEs secundários de saúde de um campo 'a,b,c' (ordem preservada, sem repetição)."""
    vistos: list[str] = []
    for parte in texto.split(","):
        codigo = normalizar(parte)
        if codigo and eh_saude(codigo) and codigo not in vistos:
            vistos.append(codigo)
    return tuple(vistos)


def contar_grupos(contagem: Mapping[str, int]) -> list[dict]:
    """[{codigo, nome, ativos}] com todos os grupos, ativos desc (empate: ordem de GRUPOS)."""
    ordem = {codigo: i for i, codigo in enumerate(CODIGOS)}
    return sorted(
        ({"codigo": g.codigo, "nome": g.nome, "ativos": contagem.get(g.codigo, 0)} for g in GRUPOS),
        key=lambda item: (-item["ativos"], ordem[item["codigo"]]),
    )
