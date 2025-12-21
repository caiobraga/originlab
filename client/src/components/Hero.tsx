import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import DemoModal from "@/components/DemoModal";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

export default function Hero() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-violet-50 pt-20 pb-32">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-300/20 rounded-full blur-3xl" />
        <div className="absolute top-60 -left-40 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-white/80 backdrop-blur-sm border border-blue-200 mb-6 md:mb-8 shadow-sm mx-2">
            <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-violet-600 flex-shrink-0" />
            <span className="text-xs md:text-sm font-medium text-gray-700 break-words">
              Inteligência Artificial para Fomento e Subvenção
            </span>
          </div>

          {/* Main heading */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 bg-clip-text text-transparent leading-tight break-words px-2">
            Transforme ideias em projetos financiados
          </h1>

          {/* Subheading */}
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed break-words px-2">
            Conecte seu projeto às melhores oportunidades de fomento com inteligência artificial. 
            Da busca à prestação de contas, tudo automatizado.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {!loading && user ? (
              <Link href="/dashboard">
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Acessar Meu Painel
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            ) : (
              <>
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Descubra seus editais ideais
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="px-8 py-6 text-lg border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50"
                  onClick={() => setIsDemoModalOpen(true)}
                >
                  Ver demonstração
                </Button>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-3xl mx-auto px-2">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-2">+2.000</div>
              <div className="text-xs md:text-sm text-gray-600 break-words">Editais mapeados</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-violet-600 mb-2">R$ 20bi</div>
              <div className="text-xs md:text-sm text-gray-600 break-words">Mercado de P&D</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-2">20.000+</div>
              <div className="text-xs md:text-sm text-gray-600 break-words">Startups no Brasil</div>
            </div>
          </div>
        </div>
      </div>

      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </section>
  );
}
