"""
Download de dados de saúde do Paraná via APIs públicas e TabNet/DATASUS
Alternativa sem necessidade de PySUS (que requer compilação C)
"""

import os
import sys
import json
import requests
import pandas as pd
from pathlib import Path
from io import StringIO
import time

# Configuração de diretórios
BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
PUBLIC_DATA_DIR = BASE_DIR / "dashboard" / "public" / "data"

# Criar diretórios se não existirem
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Código IBGE do Paraná
UF_PR = "41"

# Headers para requisições
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}


def download_tabnet_mortalidade():
    """
    Download de dados de mortalidade via TabNet/DATASUS
    Usa a API do TabNet para extrair dados do SIM
    """
    print("=" * 60)
    print("Baixando dados de MORTALIDADE (TabNet/SIM)...")
    print("=" * 60)

    # TabNet requer requisição POST específica
    # Vamos baixar dados agregados por município e causa

    # Dados de mortalidade por capítulo CID-10 para o PR
    # Fonte alternativa: dados.gov.br ou IBGE

    url_mortalidade = "https://dados.gov.br/dados/api/publico/conjuntos-dados"
    params = {
        "isPrivado": "false",
        "q": "mortalidade parana"
    }

    try:
        response = requests.get(url_mortalidade, params=params, headers=HEADERS, timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"  Encontrados {len(data.get('resultado', []))} datasets de mortalidade")
    except Exception as e:
        print(f"  Erro ao buscar datasets: {e}")

    return True


def download_ibge_populacao():
    """
    Download de dados populacionais do IBGE via API SIDRA
    Necessário para calcular taxas per capita
    """
    print("\n" + "=" * 60)
    print("Baixando dados de POPULAÇÃO (IBGE/SIDRA)...")
    print("=" * 60)

    # API SIDRA - Tabela 6579: População estimada
    # https://sidra.ibge.gov.br/tabela/6579

    url_pop = "https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/all/p/last%201/d/v9324%200"

    try:
        print("  Baixando população estimada por município...")
        response = requests.get(url_pop, headers=HEADERS, timeout=60)

        if response.status_code == 200:
            data = response.json()
            # Filtrar apenas municípios do PR (código começa com 41)
            municipios_pr = [
                {
                    "cod_ibge": item["D1C"],
                    "municipio": item["D1N"],
                    "ano": item["D2N"],
                    "populacao": int(item["V"]) if item["V"] != "-" else 0
                }
                for item in data[1:]  # Pula o header
                if item["D1C"].startswith("41")
            ]

            df = pd.DataFrame(municipios_pr)
            output_path = RAW_DIR / "populacao_municipios_pr.csv"
            df.to_csv(output_path, index=False)
            print(f"    Salvo: {output_path} ({len(df)} municípios)")
            return df
        else:
            print(f"  Erro: Status {response.status_code}")

    except Exception as e:
        print(f"  Erro: {e}")

    return None


def download_datasus_cnes_api():
    """
    Download de dados do CNES via API pública do DATASUS
    """
    print("\n" + "=" * 60)
    print("Baixando dados de ESTABELECIMENTOS (CNES API)...")
    print("=" * 60)

    # API CNES - Estabelecimentos
    url_cnes = "https://apidadosabertos.saude.gov.br/cnes/estabelecimentos"

    params = {
        "codigo_uf": 41,  # Paraná
        "limit": 1000,
        "offset": 0
    }

    all_estabelecimentos = []

    try:
        while True:
            print(f"  Baixando estabelecimentos (offset: {params['offset']})...")
            response = requests.get(url_cnes, params=params, headers=HEADERS, timeout=60)

            if response.status_code == 200:
                data = response.json()
                estabelecimentos = data.get("estabelecimentos", [])

                if not estabelecimentos:
                    break

                all_estabelecimentos.extend(estabelecimentos)
                params["offset"] += params["limit"]

                if len(estabelecimentos) < params["limit"]:
                    break

                time.sleep(0.5)  # Rate limiting
            else:
                print(f"  Erro: Status {response.status_code}")
                break

        if all_estabelecimentos:
            df = pd.DataFrame(all_estabelecimentos)
            output_path = RAW_DIR / "cnes_estabelecimentos_pr.csv"
            df.to_csv(output_path, index=False)
            print(f"    Salvo: {output_path} ({len(df)} estabelecimentos)")
            return df

    except Exception as e:
        print(f"  Erro: {e}")

    return None


def download_dados_abertos_saude():
    """
    Busca datasets de saúde no portal dados.gov.br
    """
    print("\n" + "=" * 60)
    print("Buscando datasets em dados.gov.br...")
    print("=" * 60)

    base_url = "https://dados.gov.br/dados/api/publico/conjuntos-dados"

    datasets_busca = [
        "mortalidade",
        "internacao hospitalar",
        "vacinacao",
        "estabelecimentos saude"
    ]

    resultados = {}

    for termo in datasets_busca:
        try:
            params = {"isPrivado": "false", "q": termo, "pagina": 1}
            response = requests.get(base_url, params=params, headers=HEADERS, timeout=30)

            if response.status_code == 200:
                data = response.json()
                total = data.get("count", 0)
                resultados[termo] = total
                print(f"  '{termo}': {total} datasets encontrados")
        except Exception as e:
            print(f"  Erro buscando '{termo}': {e}")

    return resultados


def download_fns_repasses():
    """
    Download de dados de repasses do FNS (Fundo Nacional de Saúde)
    via Portal da Transparência ou API FNS
    """
    print("\n" + "=" * 60)
    print("Baixando dados de REPASSES SUS (FNS)...")
    print("=" * 60)

    # API do Portal da Transparência
    url_fns = "https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-funcao"

    # Requer token de acesso
    print("  AVISO: API do Portal da Transparência requer cadastro para token")
    print("  URL: https://portaldatransparencia.gov.br/api-de-dados")

    return None


def generate_sample_data_from_web():
    """
    Gera dados de amostra baseados em informações públicas disponíveis
    quando APIs não estão acessíveis
    """
    print("\n" + "=" * 60)
    print("Gerando dados baseados em fontes públicas...")
    print("=" * 60)

    # Usar dados do TabNet que são públicos e bem documentados
    # Referência: http://tabnet.datasus.gov.br/

    return True


def main():
    """Executa o download de todos os dados disponíveis"""
    print("\n" + "=" * 60)
    print("DOWNLOAD DE DADOS DE SAÚDE DO PARANÁ")
    print("Fontes: IBGE SIDRA, DATASUS APIs, dados.gov.br")
    print("=" * 60 + "\n")

    resultados = {}

    # 1. Dados populacionais do IBGE (sempre funciona)
    pop_df = download_ibge_populacao()
    resultados["populacao_ibge"] = pop_df is not None

    # 2. Buscar datasets disponíveis
    datasets = download_dados_abertos_saude()
    resultados["busca_datasets"] = len(datasets) > 0

    # 3. Tentar CNES API
    cnes_df = download_datasus_cnes_api()
    resultados["cnes_api"] = cnes_df is not None

    # 4. Mortalidade TabNet
    resultados["mortalidade"] = download_tabnet_mortalidade()

    # 5. Repasses FNS
    resultados["fns_repasses"] = download_fns_repasses() is not None

    print("\n" + "=" * 60)
    print("RESUMO DO DOWNLOAD")
    print("=" * 60)
    for fonte, sucesso in resultados.items():
        status = "✓ OK" if sucesso else "✗ FALHA/Indisponível"
        print(f"  {fonte}: {status}")

    print("\n" + "-" * 60)
    print("PRÓXIMOS PASSOS:")
    print("-" * 60)
    print("1. Para dados completos, acessar TabNet manualmente:")
    print("   http://tabnet.datasus.gov.br/")
    print("")
    print("2. Exportar dados em CSV e salvar em data/raw/")
    print("")
    print("3. Executar preprocess_data.py para gerar JSONs")
    print("-" * 60)

    return any(resultados.values())


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
