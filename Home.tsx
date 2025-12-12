import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import DemoPanel from "@/components/DemoPanel";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import AIHumanSection from "@/components/AIHumanSection";

import { Link } from "wouter";

export default function Home() {
  return (
    <div className="flex-1">
      <Hero />
      <HowItWorks />
      <AIHumanSection />
      <DemoPanel />
      
      {/* Seção de 3 Áreas de Negócio */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-4 text-gray-900">Soluções para Todos</h2>
          <p className="text-xl text-center text-gray-600 mb-16">Escolha a solução ideal para seu perfil</p>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Pesquisadores */}
            <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-blue-200 hover:shadow-xl transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🎓</span>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Para Pesquisadores</h3>
              <p className="text-gray-600 mb-6">Encontre editais alinhados com seu perfil, valide elegibilidade e redija propostas com IA</p>
              <Link href="/dashboard">
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition">
                  Começar Grátis
                </button>
              </Link>
            </div>

            {/* Consultorias */}
            <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-purple-200 hover:shadow-xl transition">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💼</span>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Para Consultorias</h3>
              <p className="text-gray-600 mb-6">Ofereça Origem.Lab aos seus clientes e ganhe 3% sobre cada projeto aprovado</p>
              <Link href="/para-consultorias">
                <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition">
                  Saiba Mais
                </button>
              </Link>
            </div>

            {/* FAPs */}
            <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-pink-200 hover:shadow-xl transition">
              <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🏛️</span>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Para FAPs</h3>
              <p className="text-gray-600 mb-6">Modernize sua fundação, aumente candidaturas qualificadas e ganhe comissão</p>
              <Link href="/para-faps">
                <button className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 rounded-lg transition">
                  Solicitar Demo
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      
      <Pricing />
      <Testimonials />
      <Footer />
    </div>
  );
}
