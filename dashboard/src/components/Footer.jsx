import { ExternalLink, Github, Bug } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-dark-900 text-white mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Sobre */}
          <div>
            <h3 className="font-display font-semibold text-lg mb-3">
              Saúde Paraná
            </h3>
            <p className="text-dark-400 text-sm leading-relaxed">
              Dashboard de indicadores de saúde pública do Paraná.
              Parte do ecossistema DataGeo Paraná de inteligência territorial.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-display font-semibold text-lg mb-3">
              Links Úteis
            </h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://datageoparana.github.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dark-400 hover:text-water-400 text-sm flex items-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Portal DataGeo Paraná
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/avnergomes/saude-parana"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dark-400 hover:text-water-400 text-sm flex items-center gap-2 transition-colors"
                >
                  <Github className="w-4 h-4" />
                  Código no GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/avnergomes/saude-parana/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dark-400 hover:text-water-400 text-sm flex items-center gap-2 transition-colors"
                >
                  <Bug className="w-4 h-4" />
                  Reportar problema
                </a>
              </li>
            </ul>
          </div>

          {/* Fontes */}
          <div>
            <h3 className="font-display font-semibold text-lg mb-3">
              Fontes de Dados
            </h3>
            <ul className="text-dark-400 text-sm space-y-1">
              <li>SIM/DATASUS - Mortalidade</li>
              <li>SIH/DATASUS - Internações</li>
              <li>SI-PNI/DATASUS - Vacinação</li>
              <li>CNES/DATASUS - Estabelecimentos</li>
              <li>FNS/MS - Repasses SUS</li>
              <li>SISAB - Previne Brasil</li>
              <li>IBGE - População</li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-6 border-t border-dark-700 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-dark-500 text-sm">
            © {currentYear} DataGeo Paraná. Dados públicos de fontes oficiais.
          </p>
          <p className="text-dark-600 text-xs">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>
    </footer>
  );
}
