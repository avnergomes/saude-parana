/**
 * Rodapé de fonte e método de uma aba: fonte, nota metodológica, licença
 * e data de atualização, lidos do bloco `metadata` do JSON do domínio.
 * `children` permite acrescentar avisos específicos da aba.
 */

// "2026-09-13" -> "13/09/2026" (mantém o valor original se o formato divergir)
function formatDateBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

export default function FonteNota({ metadata, children }) {
  if (!metadata) return null;

  return (
    <div className="bg-white rounded-xl shadow-card p-4 text-xs text-dark-500 space-y-1">
      {metadata.fonte && (
        <p>
          <span className="font-medium text-dark-700">Fonte:</span> {metadata.fonte}
        </p>
      )}
      {metadata.nota && <p>{metadata.nota}</p>}
      {metadata.licenca && (
        <p>
          <span className="font-medium text-dark-700">Licença:</span> {metadata.licenca}
        </p>
      )}
      {children}
      {metadata.atualizacao && (
        <p>Dados atualizados em {formatDateBr(metadata.atualizacao)}</p>
      )}
    </div>
  );
}
