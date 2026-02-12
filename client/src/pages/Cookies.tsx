import Header from "@/components/Header";
import { Link } from "wouter";
import { APP_TITLE } from "@/const";

export default function Cookies() {
  return (
    <div className="flex-1 min-h-screen flex flex-col">
      <Header />
      <main className="container py-12 max-w-3xl prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Política de Cookies</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: fevereiro de 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. O que são cookies</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Cookies são pequenos arquivos de texto armazenados no seu dispositivo quando você 
            visita nosso site. Eles ajudam a lembrar preferências, melhorar a navegação e 
            analisar o uso da plataforma.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Cookies que utilizamos</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            A {APP_TITLE} utiliza:
          </p>
          <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4">
            <li><strong>Essenciais:</strong> necessários ao funcionamento (autenticação, sessão, preferências básicas).</li>
            <li><strong>Funcionais:</strong> lembrar preferências como tema e idioma.</li>
            <li><strong>Analíticos:</strong> entender como os usuários utilizam o site (ex.: métricas de uso).</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Consentimento</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Ao acessar o site, você pode aceitar ou rejeitar cookies não essenciais através do 
            banner de consentimento. Cookies essenciais são necessários para o funcionamento da 
            plataforma e não requerem consentimento.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Como gerenciar cookies</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Você pode configurar seu navegador para bloquear ou excluir cookies. Isso pode 
            afetar a experiência de uso. Para gerenciar o consentimento armazenado em nossa 
            plataforma, limpe o armazenamento local do site no seu navegador — o banner de 
            cookies será exibido novamente na próxima visita.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Terceiros</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Serviços de terceiros (autenticação, hospedagem, analytics) podem definir cookies 
            próprios. Consulte as políticas desses provedores para mais informações.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Contato</h2>
          <p className="text-gray-600 leading-relaxed">
            Dúvidas: <a href="mailto:contato@origemlab.ai" className="text-blue-600 hover:underline">contato@origemlab.ai</a>. 
            Consulte nossa{" "}
            <Link href="/politica-privacidade" className="text-blue-600 hover:underline">
              Política de Privacidade
            </Link>{" "}
            para informações gerais sobre tratamento de dados.
          </p>
        </section>
      </main>
    </div>
  );
}
