/**
 * Cartão exibido quando o JSON de um domínio opcional ainda não foi gerado
 * pelo ETL (a aba existe, os dados não). Evita quebrar o painel.
 */

import { Database } from 'lucide-react';

export default function SemDados({ fonte }) {
  return (
    <div className="bg-white rounded-xl shadow-card p-8 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-neutral-100 text-dark-400 flex items-center justify-center mb-3">
        <Database className="w-5 h-5" />
      </div>
      <p className="text-dark-700 font-medium">Dados ainda não disponíveis para este painel</p>
      <p className="text-dark-400 text-sm mt-1">
        Os arquivos deste domínio ainda não foram gerados pela rotina de ETL.
      </p>
      {fonte && (
        <p className="text-dark-400 text-xs mt-2">
          <span>Fonte prevista:</span> {fonte}
        </p>
      )}
    </div>
  );
}
