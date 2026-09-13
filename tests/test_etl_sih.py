"""Testes do ETL SIH/SUS (scripts/etl/sih.py), sem rede.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import common, sih, tabnet  # noqa: E402

FORM_HTML = """<html><body><FORM ACTION="/cgi/tabcgi.exe?sih/cnv/nrpr.def" METHOD=POST>
<SELECT NAME="Arquivos" ID="A" SIZE=4 MULTIPLE>
<OPTION VALUE="nrpr2602.dbf" SELECTED >Fev/2026
<OPTION VALUE="nrpr2601.dbf">Jan/2026
""" + "\n".join(f'<OPTION VALUE="nrpr25{m:02d}.dbf">{m}/2025' for m in range(12, 0, -1)) + """
<OPTION VALUE="nrpr1412.dbf">Dez/2014
</SELECT></FORM></body></html>"""

RODAPE = (
    " Fonte: Ministério da Saúde - Sistema de Informações Hospitalares do SUS (SIH/SUS)\n"
    " Notas:\n Dados referentes aos últimos seis meses, sujeitos a atualização.\n"
)


def csv_capitulos(periodo, linhas):
    return (" Morbidade Hospitalar do SUS - por local de residência - Paraná\n"
            f"Internações por Município e Capítulo CID-10\nPeríodo:{periodo}\n"
            '"Município";"Cap 01";"Cap 09";"Cap 22";"Total"\n' + linhas + RODAPE)


def csv_totais(periodo, linhas):
    return (" Morbidade Hospitalar do SUS - por local de residência - Paraná\n"
            f"InternaçõesValor totalÓbitos por Município\nPeríodo:{periodo}\n"
            '"Município";"Internações";"Valor_total";"Óbitos"\n' + linhas + RODAPE)


CSVS = {
    ("cap", 2025): csv_capitulos("Dez/2025, ..., Jan/2025",
                                 '"410010 ABATIA";10;20;-;30\n"410020 ADRIANOPOLIS";5;15;1;21\n'
                                 '"Total";15;35;1;51\n'),
    ("tot", 2025): csv_totais("Dez/2025, ..., Jan/2025",
                              '"410010 ABATIA";30;401658,21;4\n"410020 ADRIANOPOLIS";21;100,50;-\n'
                              '"Total";51;401758,71;4\n'),
    ("cap", 2026): csv_capitulos("Fev/2026, Jan/2026",
                                 '"410010 ABATIA";2;3;-;5\n"Total";2;3;-;5\n'),
    ("tot", 2026): csv_totais("Fev/2026, Jan/2026",
                              '"410010 ABATIA";5;1000,00;1\n"Total";5;1000,00;1\n'),
}
MAPA = {"410010": "4100103", "410020": "4100202"}
POP = {"4100103": {2025: 10000, 2026: 10000}, "4100202": {2025: 5000}}


def test_arquivos_por_ano_agrupa_e_ordena_meses():
    arquivos = sih.arquivos_por_ano(FORM_HTML)
    assert list(arquivos) == [2025, 2026]  # 2014 fica fora (ano_inicial 2015)
    assert arquivos[2025] == [f"nrpr25{m:02d}.dbf" for m in range(1, 13)]
    assert arquivos[2026] == ["nrpr2601.dbf", "nrpr2602.dbf"]
    assert sih.ultima_competencia(arquivos) == "2026-02"
    with pytest.raises(common.FonteIndisponivel):
        sih.arquivos_por_ano('<select name="Arquivos"><option value="x.dbf">x</select>')


def test_campos_usam_os_valores_exatos_do_formulario():
    arquivos = ["nrpr2601.dbf", "nrpr2602.dbf"]
    assert sih.campos_capitulos(arquivos) == {
        "Linha": "Município", "Coluna": "Capítulo_CID-10", "Incremento": "Internações",
        "Arquivos": arquivos, "formato": "table", "mostre": "Mostra",
    }
    assert sih.campos_totais(arquivos) == {
        "Linha": "Município", "Coluna": "--Não-Ativa--",
        "Incremento": ["Internações", "Valor_total", "Óbitos"],
        "Arquivos": arquivos, "formato": "table", "mostre": "Mostra",
    }


def test_totais_por_municipio_e_taxa_estadual():
    totais = sih.totais_por_municipio(tabnet.parse_csv(CSVS[("tot", 2025)]), MAPA)
    assert totais == {
        "4100103": {"internacoes": 30, "valor_total": 401658.21, "obitos": 4},
        "4100202": {"internacoes": 21, "valor_total": 100.5, "obitos": 0},
    }
    assert sih.taxa_estadual(totais, POP, 2025) == 3.4  # 51 / 15000 * 1000
    assert sih.taxa_estadual(totais, {}, 2025) is None


def _ano(ano, parcial):
    return sih.AnoSih(
        ano=ano, brutos=(f"tabnet/sih_{ano}.csv", f"tabnet/sih_{ano}_totais.csv"), parcial=parcial,
        capitulos=tabnet.tabela_capitulos(tabnet.parse_csv(CSVS[("cap", ano)]), MAPA),
        totais=sih.totais_por_municipio(tabnet.parse_csv(CSVS[("tot", ano)]), MAPA),
    )


def test_montar_saida_usa_ultimo_ano_completo_como_referencia():
    saida = sih.montar_saida([_ano(2026, True), _ano(2025, False)], POP, "2026-02", "2026-09-13")

    assert saida["anoReferencia"] == 2025
    assert saida["metadata"]["anoParcial"] == 2026
    assert saida["metadata"]["ultimaCompetencia"] == "2026-02"
    assert saida["metadata"]["periodo"] == "2025-2026"
    assert saida["capitulos"] == [
        {"codigo": "I", "nome": "Algumas doenças infecciosas e parasitárias"},
        {"codigo": "IX", "nome": "Doenças do aparelho circulatório"},
        {"codigo": "XXII", "nome": "CID-10 não disponível ou não preenchido"},
    ]
    assert saida["porAno"] == [
        {"ano": 2025, "internacoes": 51, "valor_total": 401758.71, "obitos": 4, "taxa": 3.4, "parcial": False},
        {"ano": 2026, "internacoes": 5, "valor_total": 1000.0, "obitos": 1, "taxa": 0.5, "parcial": True},
    ]
    assert saida["porAnoCapitulo"] == [
        {"ano": 2025, "total": 51, "I": 15, "IX": 35, "XXII": 1},
        {"ano": 2026, "total": 5, "I": 2, "IX": 3, "XXII": 0},
    ]
    assert saida["porMunicipio"] == {
        "4100103": {"internacoes": 30, "valor_total": 401658.21, "obitos": 4, "taxa": 3.0,
                    "I": 10, "IX": 20, "XXII": 0},
        "4100202": {"internacoes": 21, "valor_total": 100.5, "obitos": 0, "taxa": 4.2,
                    "I": 5, "IX": 15, "XXII": 1},
    }


def test_montar_saida_so_com_ano_parcial_usa_o_proprio_ano():
    saida = sih.montar_saida([_ano(2026, True)], POP, "2026-02", "2026-09-13")
    assert saida["anoReferencia"] == 2026
    assert list(saida["porMunicipio"]) == ["4100103"]


def test_executar_faz_dois_posts_por_ano_e_grava_tudo(tmp_path, monkeypatch):
    chamadas = []

    def consultar_falso(def_path, campos, servidor=tabnet.TABNET, http=None):
        ano = 2000 + int(campos["Arquivos"][0][4:6])
        tipo = "cap" if campos["Coluna"] == "Capítulo_CID-10" else "tot"
        chamadas.append((tipo, ano, len(campos["Arquivos"])))
        return CSVS[(tipo, ano)]

    monkeypatch.setattr(common, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(common, "PUBLIC_DATA_DIR", tmp_path / "public")
    monkeypatch.setattr(common, "sessao", lambda: None)
    monkeypatch.setattr(common, "cod6_para_7", lambda: MAPA)
    monkeypatch.setattr(common, "populacao_municipal", lambda: POP)
    monkeypatch.setattr(tabnet, "MINIMO_MUNICIPIOS_PR", 1)  # fixture com poucos municípios
    monkeypatch.setattr(tabnet, "baixar_formulario", lambda def_path, servidor=None, http=None: FORM_HTML)
    monkeypatch.setattr(tabnet, "consultar", consultar_falso)

    manifesto = sih.executar({})

    assert chamadas == [("cap", 2025, 12), ("tot", 2025, 12), ("cap", 2026, 2), ("tot", 2026, 2)]
    assert set(manifesto) == {"tabnet/sih_2025.csv", "tabnet/sih_2025_totais.csv",
                              "tabnet/sih_2026.csv", "tabnet/sih_2026_totais.csv"}
    assert manifesto["tabnet/sih_2025_totais.csv"]["linhas"] == 2
    bruto = (tmp_path / "raw" / "tabnet" / "sih_2025_totais.csv").read_text(encoding="utf-8")
    assert '"Internações";"Valor_total";"Óbitos"' in bruto

    saida = json.loads((tmp_path / "public" / sih.SAIDA).read_text(encoding="utf-8"))
    assert list(saida) == ["metadata", "capitulos", "porAno", "porAnoCapitulo", "porMunicipio", "anoReferencia"]
    assert saida["anoReferencia"] == 2025
    assert saida["metadata"]["ultimaCompetencia"] == "2026-02"
    assert saida["porMunicipio"]["4100103"]["internacoes"] == 30
    assert chr(8212) not in json.dumps(saida, ensure_ascii=False)  # sem travessão nos textos
