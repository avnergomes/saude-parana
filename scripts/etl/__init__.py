"""ETLs de domínio do Saúde Paraná (um módulo por fonte oficial).

Cada módulo expõe:
  DOMINIO: str            identificador curto (ex.: "cnes")
  SAIDA: str              nome do JSON gravado em dashboard/public/data
  executar(manifesto) -> manifesto atualizado; levanta exceção se a fonte falhar

Orquestração: scripts/run_etl.py
"""
