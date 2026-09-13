/**
 * Cartão exibido enquanto os JSONs opcionais dos domínios (DATASUS, APS,
 * InfoDengue, ANS) ainda estão sendo baixados em segundo plano.
 */

export default function CarregandoDominio() {
  return (
    <div className="bg-white rounded-xl shadow-card p-8 text-center text-dark-400">
      Carregando dados do painel...
    </div>
  );
}
