import Header from "@/components/Header";
import { Link } from "wouter";
import { APP_TITLE } from "@/const";

export default function Sobre() {
  return (
    <div className="flex-1 min-h-screen flex flex-col">
      <Header />
      <main className="container py-12 max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Sobre nós</h1>

        <p className="text-gray-600 leading-relaxed mb-6">
          A {APP_TITLE} é uma plataforma de inteligência artificial voltada para fomento e subvenção. 
          Nosso objetivo é conectar pesquisadores, empresas e empreendedores às melhores oportunidades 
          de financiamento — editais, chamadas públicas e programas de incentivo — do Brasil e do mundo.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mb-3">O que fazemos</h2>
        <p className="text-gray-600 leading-relaxed mb-6">
          Utilizamos IA para analisar seu perfil e currículo, identificar editais compatíveis com seu 
          projeto e ranquear as oportunidades por probabilidade de aprovação. Da busca à prestação de 
          contas, oferecemos suporte em todo o ciclo: formulários inteligentes, acompanhamento de 
          prazos e documentação.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mb-3">Para quem é</h2>
        <p className="text-gray-600 leading-relaxed mb-8">
          A plataforma atende pesquisadores, startups, empresas e pessoas jurídicas que buscam 
          financiamento público ou privado para pesquisa, inovação e desenvolvimento de projetos.
        </p>

        <p className="text-gray-600 leading-relaxed">
          Quer saber mais? Conheça{" "}
          <Link href="/inicio#como-funciona" className="text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2">
            como funciona
          </Link>{" "}
          ou entre em{" "}
          <a href="mailto:contato@origemlab.ai" className="text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2">
            contato
          </a>
          .
        </p>
      </main>
    </div>
  );
}
