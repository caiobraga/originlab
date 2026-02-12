import { useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";

const CONTATO_EMAIL = "contato@origemlab.ai";

export default function Contato() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Contato - ${nome || "Site"}`);
    const body = encodeURIComponent(
      `Olá,\n\n${mensagem}\n\n---\nEnviado por: ${nome || "Não informado"}\nEmail: ${email || "Não informado"}`
    );
    window.location.href = `mailto:${CONTATO_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="flex-1 min-h-screen flex flex-col">
      <Header />
      <main className="container py-12 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Contato</h1>
        <p className="text-gray-600 mb-8">
          Envie sua mensagem ou entre em contato diretamente pelo email.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 mb-10">
          <a
            href={`mailto:${CONTATO_EMAIL}`}
            className="inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Mail className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium">{CONTATO_EMAIL}</span>
          </a>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="contato-nome" className="block text-sm font-medium text-gray-700 mb-1">
              Nome
            </label>
            <Input
              id="contato-nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              className="max-w-md"
            />
          </div>
          <div>
            <label htmlFor="contato-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <Input
              id="contato-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="max-w-md"
            />
          </div>
          <div>
            <label htmlFor="contato-mensagem" className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem
            </label>
            <textarea
              id="contato-mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Como podemos ajudar?"
              rows={5}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            Enviar mensagem
          </Button>
        </form>

        <p className="mt-6 text-sm text-gray-500">
          Ao clicar em &quot;Enviar mensagem&quot;, seu cliente de email será aberto com a mensagem preenchida. 
          Envie o email para concluir o contato.
        </p>
      </main>
    </div>
  );
}
