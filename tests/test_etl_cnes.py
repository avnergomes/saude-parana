# -*- coding: utf-8 -*-
"""Testes do ETL CNES (sem rede): zips montados em memória com linhas de exemplo.

Rodar na raiz do repositório: py -3 -m pytest tests -q
"""

import json
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from etl import cnes  # noqa: E402
from etl import cnes_tipos  # noqa: E402

# ── Amostras ────────────────────────────────────────────────────────────

# Cabeçalho reduzido: todas as colunas que o ETL lê, mais três de contato/endereço
# (LGPD) que jamais podem chegar à saída.
CABECALHO_CNES = cnes.COLUNAS_CNES + ("NO_EMAIL", "NU_TELEFONE", "NO_LOGRADOURO")

COD6_7 = {"410690": "4106902", "410830": "4108304", "412550": "4125506"}
GEO = {
    "4106902": {"nome": "Curitiba", "regional": "Curitiba"},
    "4108304": {"nome": "Foz do Iguaçu", "regional": "Cascavel"},
    "4125506": {"nome": "São José dos Pinhais", "regional": "Curitiba"},
}
REGIOES = {"410690": "2ª RS METROPOLITANA", "410830": "9ª RS FOZ DO IGUAÇU",
           "412550": "2ª RS METROPOLITANA"}
POP = {"4106902": {2025: 1_800_000, 2026: 1_832_183},
       "4108304": {2026: 260_000},
       "4125506": {2026: 330_000}}


def linha_cnes(cnes_cod, uf, ibge, razao, fantasia, esfera, tipo, lat, lon, natjur,
               desab, amb_sus, email="", telefone="", logradouro="") -> str:
    campos = (cnes_cod, uf, ibge, razao, fantasia, esfera, tipo, lat, lon, natjur,
              desab, amb_sus, email, telefone, logradouro)
    return ";".join(f'"{c}"' for c in campos)


LINHAS_CNES = [
    # hospital estadual SUS em Curitiba, coordenada com muitas casas
    linha_cnes("15113", "41", "410690", "SOCIEDADE HOSPITALAR", "HOSPITAL SÃO JOSÉ", "ESTADUAL",
               "5", "-25.4284123456", "-49.2733987", "1244", "", "SIM", "h@x.org", "4133334444",
               "RUA A"),
    # hospital privado sem ambulatório SUS, mas com leitos SUS no arquivo de leitos
    linha_cnes("99999", "41", "412550", "CLINICA LTDA", "HOSPITAL PINHAIS", "MUNICIPAL",
               "05", "-25.53", "-49.20", "2062", "", "NAO"),
    # UPA em Foz do Iguaçu, sem NO_FANTASIA (cai na razão social)
    linha_cnes("13129", "41", "410830", "PREFEITURA MUNICIPAL DE FOZ", "", "MUNICIPAL",
               "73", "-25.5469", "-54.5882", "1244", "", "SIM"),
    # hospital com coordenada implausível (fora do PR): conta, mas não vira ponto
    linha_cnes("77777", "41", "410690", "HOSPITAL FORA", "HOSPITAL FORA", "DUPLA",
               "7", "-3.1", "-49.2", "3999", "", "SIM"),
    # hospital cadastrado como pessoa física: conta, mas nunca vira ponto (LGPD)
    linha_cnes("55555", "41", "410690", "JOAO DA SILVA", "HOSPITAL DIA JOAO", "MUNICIPAL",
               "62", "-25.40", "-49.30", "4000", "", "NAO"),
    # consultório isolado de pessoa física, com e-mail e telefone pessoais
    linha_cnes("2731258", "41", "410690", "MARIA DE OLIVEIRA", "MARIA DE OLIVEIRA", "MUNICIPAL",
               "22", "-25.41", "-49.31", "4000", "", "NAO", "maria@gmail.com", "(41)99990000",
               "RUA MATO GROSSO"),
    # UBS SUS em Curitiba
    linha_cnes("205", "41", "410690", "PREFEITURA DE CURITIBA", "UBS CENTRO", "MUNICIPAL",
               "2", "-25.43", "-49.27", "1244", "", "SIM"),
    # farmácia sem coordenada
    linha_cnes("300", "41", "410830", "FARMACIA LTDA", "FARMACIA", "MUNICIPAL",
               "43", "", "", "2062", "", "NAO"),
    # código de tipo desconhecido -> outros
    linha_cnes("301", "41", "410830", "UNIDADE X", "UNIDADE X", "MUNICIPAL",
               "16", "-25.5", "-54.5", "1244", "", "NAO"),
    # desativado (CO_MOTIVO_DESAB preenchido)
    linha_cnes("400", "41", "410690", "HOSPITAL FECHADO", "HOSPITAL FECHADO", "ESTADUAL",
               "5", "-25.44", "-49.28", "1244", "06", "SIM"),
    # município desconhecido
    linha_cnes("401", "41", "419999", "UBS PERDIDA", "UBS PERDIDA", "MUNICIPAL",
               "2", "-25.44", "-49.28", "1244", "", "SIM"),
    # outra UF
    linha_cnes("402", "35", "355030", "HOSPITAL SP", "HOSPITAL SP", "ESTADUAL",
               "5", "-23.55", "-46.63", "1244", "", "SIM"),
]

CABECALHO_LEITOS = ('"COMP";"REGIAO";"UF";CO_IBGE;"MUNICIPIO";"MOTIVO_DESABILITACAO";"CNES";'
                    '"NOME_ESTABELECIMENTO";"NU_TELEFONE";"NO_EMAIL";"CO_TIPO_UNIDADE";'
                    'LEITOS_EXISTENTES;LEITOS_SUS;UTI_TOTAL_EXIST;UTI_TOTAL_SUS')


def linha_leitos(comp, uf, ibge, municipio, desab, cnes_cod, nome, tipo, exist, sus,
                 uti=0, uti_sus=0) -> str:
    return (f'"{comp}";"SUL";"{uf}";"{ibge}";"{municipio}";"{desab}";"{cnes_cod}";"{nome}";'
            f'"4133334444";"x@y.org";"{tipo}";"{exist}";"{sus}";"{uti}";"{uti_sus}"')


LINHAS_LEITOS = [
    linha_leitos("202606", "PR", "410690", "CURITIBA", "", "0015113", "HOSPITAL SÃO JOSÉ", "05", 90, 70),
    linha_leitos("202607", "PR", "410690", "CURITIBA", "", "0015113", "HOSPITAL SÃO JOSÉ", "05", 100, 80),
    linha_leitos("202607", "PR", "412550", "SÃO JOSÉ DOS PINHAIS", "", "0099999", "HOSPITAL PINHAIS",
                 "05", 40, 10),
    linha_leitos("202607", "PR", "410690", "CURITIBA", "06", "0000400", "HOSPITAL FECHADO", "05", 30, 30),
    linha_leitos("202607", "SP", "355030", "SAO PAULO", "", "0000402", "HOSPITAL SP", "05", 500, 400),
]


def zip_com_csv(caminho: Path, nome_csv: str, linhas: list[bytes]) -> Path:
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(nome_csv, b"\r\n".join(linhas) + b"\r\n")
    return caminho


@pytest.fixture
def zip_cnes(tmp_path: Path) -> Path:
    cabecalho = ";".join(f'"{c}"' for c in CABECALHO_CNES).encode("utf-8")
    linhas = [cabecalho] + [l.encode("utf-8") for l in LINHAS_CNES]
    # linha em latin-1 no meio de um arquivo UTF-8, como acontece no CSV real
    linhas.append(linha_cnes("500", "41", "412550", "POSTO SAÚDE", "POSTO SAÚDE", "MUNICIPAL",
                             "1", "-25.5", "-49.2", "1244", "", "SIM").encode("latin-1"))
    return zip_com_csv(tmp_path / "cnes.zip", "cnes_estabelecimentos.csv", linhas)


@pytest.fixture
def zip_leitos(tmp_path: Path) -> Path:
    linhas = [CABECALHO_LEITOS.encode("latin-1")] + [l.encode("latin-1") for l in LINHAS_LEITOS]
    return zip_com_csv(tmp_path / "leitos.zip", "Leitos_2026.csv", linhas)


@pytest.fixture
def processado(zip_cnes: Path, zip_leitos: Path):
    estabs, descartes = cnes.ler_estabelecimentos(zip_cnes, COD6_7)
    leitos = cnes.ler_leitos(zip_leitos)
    return estabs, descartes, leitos


# ── Agrupamento de tipos ────────────────────────────────────────────────

def test_grupo_de_aceita_codigos_com_e_sem_zero():
    assert cnes_tipos.grupo_de("05") == "hospital"
    assert cnes_tipos.grupo_de("5") == "hospital"
    assert cnes_tipos.grupo_de("22") == "clinica_consultorio"
    assert cnes_tipos.grupo_de("73") == "pronto_atendimento"
    assert cnes_tipos.grupo_de("70") == "atencao_psicossocial"
    assert cnes_tipos.grupo_de("68") == "vigilancia_gestao"
    assert cnes_tipos.grupo_de("16") == "outros"
    assert cnes_tipos.grupo_de("") == "outros"


def test_grupos_nao_se_sobrepoem_e_outros_e_o_ultimo():
    todos = [t for g in cnes_tipos.GRUPOS for t in g.tipos]
    assert len(todos) == len(set(todos))
    assert cnes_tipos.CODIGOS[-1] == "outros"
    assert cnes_tipos.PONTOS <= set(cnes_tipos.CODIGOS)


# ── Leitura ─────────────────────────────────────────────────────────────

def test_ler_estabelecimentos_filtra_uf_desativados_e_municipio(processado):
    estabs, descartes, _ = processado
    assert descartes == cnes.Descartes(linhas_uf=12, desativados=1, municipio_desconhecido=1)
    assert len(estabs) == 10
    por_cnes = {e.cnes: e for e in estabs}
    assert "0000402" not in por_cnes  # outra UF
    assert "0000400" not in por_cnes  # desativado
    assert "0000401" not in por_cnes  # município desconhecido
    hospital = por_cnes["0015113"]
    assert hospital.cod_ibge == "4106902"
    assert hospital.tipo == "hospital"
    assert hospital.nome == "HOSPITAL SÃO JOSÉ"
    assert (hospital.lat, hospital.lon) == (-25.42841, -49.2734)
    assert hospital.sus_ambulatorial is True
    assert hospital.esfera == "ESTADUAL"


def test_ler_estabelecimentos_decodifica_linha_latin1_e_coordenadas_invalidas(processado):
    estabs, _, _ = processado
    por_cnes = {e.cnes: e for e in estabs}
    assert por_cnes["0000500"].tipo == "ubs"  # linha em latin-1 foi lida
    assert por_cnes["0077777"].lat is None  # fora da faixa do PR
    assert por_cnes["0000300"].lat is None and por_cnes["0000300"].lon is None  # vazio
    assert por_cnes["0013129"].nome == "PREFEITURA MUNICIPAL DE FOZ"  # sem fantasia
    assert por_cnes["0000301"].tipo == "outros"


def test_ler_estabelecimentos_nao_guarda_nome_de_pessoa_fisica_nem_de_outros_tipos(processado):
    estabs, _, _ = processado
    por_cnes = {e.cnes: e for e in estabs}
    assert por_cnes["2731258"].nome == ""
    assert por_cnes["2731258"].pessoa_fisica is True
    assert por_cnes["0055555"].nome == ""  # hospital de pessoa física
    assert por_cnes["0000205"].nome == ""  # UBS: fora da camada de pontos


def test_ler_estabelecimentos_exige_colunas(tmp_path: Path):
    zip_ruim = zip_com_csv(tmp_path / "ruim.zip", "x.csv", [b'"CO_CNES";"CO_UF"', b'"1";"41"'])
    with pytest.raises(cnes.common.FonteIndisponivel):
        cnes.ler_estabelecimentos(zip_ruim, COD6_7)


def test_ler_leitos_usa_ultima_competencia_e_ignora_desabilitados(processado):
    _, _, leitos = processado
    assert leitos.competencia == "202607"
    assert leitos.linhas == 4  # só PR, todas as competências
    assert leitos.por_cnes == {
        "0015113": cnes.Leito("410690", 100, 80),
        "0099999": cnes.Leito("412550", 40, 10),
    }


def test_ler_leitos_bruto_reduzido_sem_contato(processado):
    _, _, leitos = processado
    linhas = leitos.texto_bruto.splitlines()
    assert linhas[0] == ";".join(cnes.COLUNAS_LEITOS_BRUTO)
    assert len(linhas) == 5
    assert linhas[1].startswith("202606;410690;0015113;05;;90;70")
    for proibido in ("NU_TELEFONE", "NO_EMAIL", "4133334444", "x@y.org", "HOSPITAL", "SP"):
        assert proibido not in leitos.texto_bruto
    assert leitos.texto_bruto.endswith("\n")


def test_ler_leitos_sem_linhas_da_uf_falha(tmp_path: Path):
    zip_vazio = zip_com_csv(tmp_path / "v.zip", "Leitos.csv",
                            [CABECALHO_LEITOS.encode("latin-1"), LINHAS_LEITOS[-1].encode("latin-1")])
    with pytest.raises(cnes.common.FonteIndisponivel):
        cnes.ler_leitos(zip_vazio)


def test_coordenada_aceita_virgula_e_rejeita_fora_da_faixa():
    assert cnes.coordenada("-25,4284123", (-27, -22), 5) == -25.42841
    assert cnes.coordenada("-25.4", (-27, -22), 5) == -25.4
    assert cnes.coordenada("", (-27, -22), 5) is None
    assert cnes.coordenada("abc", (-27, -22), 5) is None
    assert cnes.coordenada("-21.9", (-27, -22), 5) is None
    assert cnes.coordenada("nan", (-27, -22), 5) is None


# ── Agregação ───────────────────────────────────────────────────────────

def test_contar_tipos_cobre_todos_os_grupos_e_ordena(processado):
    estabs, _, _ = processado
    tipos = cnes_tipos.contar_tipos(e.tipo for e in estabs)
    assert [t["codigo"] for t in tipos[:2]] == ["hospital", "ubs"]
    assert {t["codigo"] for t in tipos} == set(cnes_tipos.CODIGOS)
    por_codigo = {t["codigo"]: t["total"] for t in tipos}
    assert por_codigo == {"hospital": 4, "ubs": 2, "pronto_atendimento": 1, "clinica_consultorio": 1,
                          "farmacia": 1, "outros": 1, "atencao_psicossocial": 0, "diagnostico": 0,
                          "vigilancia_gestao": 0}
    assert tipos[0]["nome"] == "Hospitais"
    assert sum(t["total"] for t in tipos) == len(estabs)


def test_agregar_municipios_conta_sus_leitos_e_taxas(processado):
    estabs, _, leitos = processado
    municipios = cnes.agregar_municipios(estabs, leitos, GEO, REGIOES, POP, 2026)
    assert [m["cod_ibge"] for m in municipios] == ["4106902", "4108304", "4125506"]
    curitiba = municipios[0]
    assert curitiba["municipio"] == "Curitiba"
    assert curitiba["regional"] == "Curitiba"
    assert curitiba["regiao_saude"] == "2ª RS METROPOLITANA"
    assert curitiba["total"] == 5 and curitiba["sus"] == 3
    assert curitiba["hospital"] == 3 and curitiba["ubs"] == 1 and curitiba["clinica_consultorio"] == 1
    assert curitiba["leitos_total"] == 100 and curitiba["leitos_sus"] == 80
    assert curitiba["populacao"] == 1_832_183
    assert curitiba["estab_por_10mil"] == round(5 / 1_832_183 * 10_000, 2)
    assert curitiba["leitos_sus_por_mil"] == round(80 / 1_832_183 * 1000, 2)
    pinhais = municipios[2]
    assert pinhais["municipio"] == "São José dos Pinhais"
    assert pinhais["total"] == 2 and pinhais["sus"] == 2  # hospital só com leitos SUS + UBS latin-1
    assert pinhais["leitos_total"] == 40 and pinhais["leitos_sus"] == 10


def test_agregar_municipios_inclui_municipio_sem_estabelecimento(processado):
    estabs, _, leitos = processado
    geo = {**GEO, "4100103": {"nome": "Abatiá", "regional": "Cornélio Procópio"}}
    municipios = cnes.agregar_municipios(estabs, leitos, geo, REGIOES, {}, 2026)
    abatia = municipios[-1]
    assert abatia["municipio"] == "Abatiá"
    assert abatia["total"] == 0 and abatia["leitos_total"] == 0
    assert abatia["regiao_saude"] is None
    assert abatia["populacao"] is None
    assert abatia["estab_por_10mil"] is None and abatia["leitos_sus_por_mil"] is None
    chaves = list(abatia.keys())
    assert chaves[:6] == ["cod_ibge", "municipio", "regional", "regiao_saude", "total", "sus"]
    assert chaves[6:15] == list(cnes_tipos.CODIGOS)
    assert chaves[15:] == ["leitos_total", "leitos_sus", "populacao", "estab_por_10mil",
                           "leitos_sus_por_mil"]


def test_montar_pontos_so_hospitais_e_pa_com_coordenada(processado):
    estabs, _, leitos = processado
    pontos = cnes.montar_pontos(estabs, leitos.por_cnes)
    assert [p["cnes"] for p in pontos] == ["0015113", "0013129", "0099999"]  # cod_ibge, cnes
    assert pontos[0] == {
        "cnes": "0015113", "nome": "HOSPITAL SÃO JOSÉ", "tipo": "hospital", "cod_ibge": "4106902",
        "lat": -25.42841, "lon": -49.2734, "sus": True, "esfera": "ESTADUAL",
        "leitos": 100, "leitos_sus": 80,
    }
    upa = pontos[1]
    assert upa["tipo"] == "pronto_atendimento" and upa["leitos"] is None and upa["leitos_sus"] is None
    pinhais = pontos[2]
    assert pinhais["sus"] is True  # NAO no ambulatório, mas leitos SUS > 0


def test_montar_saida_respeita_contrato_e_lgpd(processado):
    estabs, descartes, leitos = processado
    saida = cnes.montar_saida(estabs, descartes, leitos, REGIOES, "2026-09-12", "2026-09-13", GEO, POP)
    assert list(saida.keys()) == ["metadata", "tipos", "porMunicipio", "pontos"]
    meta = saida["metadata"]
    assert list(meta.keys()) == ["fonte", "licenca", "competenciaCnes", "competenciaLeitos",
                                 "atualizacao", "descartados", "nota"]
    assert meta["fonte"] == cnes.FONTE and meta["licenca"] == "CC BY-ND 3.0"
    assert meta["competenciaCnes"] == "2026-09-12"
    assert meta["competenciaLeitos"] == "2026-07"
    assert meta["atualizacao"] == "2026-09-13"
    assert meta["descartados"] == {"desativados": 1, "municipioDesconhecido": 1}
    assert "2026" in meta["nota"]
    texto = json.dumps(saida, ensure_ascii=False, separators=(",", ":"))
    for proibido in ("@", "gmail", "99990000", "4133334444", "RUA MATO GROSSO", "RUA A",
                     "MARIA DE OLIVEIRA", "JOAO DA SILVA", "HOSPITAL DIA JOAO", "HOSPITAL FECHADO"):
        assert proibido not in texto
    for esperado in ("Foz do Iguaçu", "São José dos Pinhais", "HOSPITAL SÃO JOSÉ", "9ª RS FOZ DO IGUAÇU"):
        assert esperado in texto
    assert json.loads(texto) == saida


def test_montar_saida_e_deterministica_e_nao_muta_entradas(processado):
    estabs, descartes, leitos = processado
    geo_antes = json.dumps(GEO, sort_keys=True)
    a = cnes.montar_saida(estabs, descartes, leitos, REGIOES, "2026-09-12", "2026-09-13", GEO, POP)
    b = cnes.montar_saida(list(reversed(estabs)), descartes, leitos, REGIOES, "2026-09-12",
                          "2026-09-13", GEO, POP)
    assert json.dumps(a) == json.dumps(b)
    assert json.dumps(GEO, sort_keys=True) == geo_antes


# ── Metadados e manifesto ───────────────────────────────────────────────

def test_data_competencia_usa_a_data_do_csv_e_ignora_last_modified(zip_cnes: Path):
    # Um reenvio dos mesmos bytes ao S3 muda o Last-Modified sem mudar o dado:
    # a competência vem da data do CSV dentro do zip.
    with zipfile.ZipFile(zip_cnes) as zf:
        data_csv = "%04d-%02d-%02d" % zf.infolist()[0].date_time[:3]
    com_cabecalho = cnes.common.Download(zip_cnes, "Sat, 12 Sep 2026 06:11:53 GMT", 1)
    sem_cabecalho = cnes.common.Download(zip_cnes, None, 1)
    assert cnes.data_competencia(com_cabecalho) == data_csv
    assert cnes.data_competencia(sem_cabecalho) == data_csv


def test_registrar_brutos_grava_texto_reduzido_e_hash_do_zip(processado, zip_cnes, tmp_path, monkeypatch):
    monkeypatch.setattr(cnes.common, "RAW_DIR", tmp_path)
    _, descartes, leitos = processado
    texto_regioes = '[{"codigo_municipio": "410690"}]\n'
    download = cnes.common.Download(zip_cnes, None, zip_cnes.stat().st_size)
    manifesto = cnes.registrar_brutos({}, download, descartes, leitos, "http://leitos", texto_regioes)
    assert set(manifesto) == {"cnes_estabelecimentos_csv.zip", "leitos_pr.csv", "regioes_saude_pr.json"}
    assert manifesto["cnes_estabelecimentos_csv.zip"]["linhas"] == 12
    assert not (tmp_path / "cnes_estabelecimentos_csv.zip").exists()  # zip: só o hash
    assert (tmp_path / "leitos_pr.csv").read_text(encoding="utf-8") == leitos.texto_bruto
    assert manifesto["leitos_pr.csv"]["linhas"] == 4
    assert (tmp_path / "regioes_saude_pr.json").read_text(encoding="utf-8") == texto_regioes
    assert manifesto["regioes_saude_pr.json"]["linhas"] == 1
    assert manifesto["leitos_pr.csv"]["url"] == "http://leitos"
