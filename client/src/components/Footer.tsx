import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_TITLE } from "@/const";
import { Mail, Linkedin, Twitter, Github, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast.error("Por favor, insira um email válido");
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      // Salvar lead no Supabase (tabela leads)
      const { error: leadError } = await supabase
        .from("leads")
        .insert({
          email: email.toLowerCase().trim(),
          source: "landing_page_footer",
        });

      // Se der erro porque a tabela não existe ou por permissão, não é crítico
      // O importante é redirecionar para cadastro
      if (leadError) {
        const errorMsg = leadError.message || "";
        const isTableNotFound = 
          errorMsg.includes("relation") || 
          errorMsg.includes("does not exist") ||
          errorMsg.includes("permission") ||
          errorMsg.includes("policy");
        
        if (!isTableNotFound) {
          console.warn("Erro ao salvar lead (não crítico):", leadError);
        }
        // Mesmo com erro, continuar com o fluxo
      } else {
        console.log("Lead salvo com sucesso:", email);
      }

      setSuccess(true);
      toast.success("Redirecionando para cadastro...");
      
      // Redirecionar para cadastro após 1 segundo
      setTimeout(() => {
        setLocation(`/cadastro?email=${encodeURIComponent(email)}`);
      }, 1000);
    } catch (error) {
      console.error("Erro ao processar email:", error);
      // Mesmo com erro, redirecionar para cadastro
      toast.success("Redirecionando para cadastro...");
      setTimeout(() => {
        setLocation(`/cadastro?email=${encodeURIComponent(email)}`);
      }, 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="bg-gray-900 text-white" role="contentinfo">
      {/* CTA Section */}
      <div className="py-16 bg-[radial-gradient(1200px_circle_at_50%_-20%,color-mix(in_oklab,var(--attention)_35%,transparent),transparent_60%),linear-gradient(180deg,#030712,#0b1020)]">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para transformar suas ideias em realidade?
          </h2>
          <p className="text-xl mb-8 text-gray-200">
            Comece gratuitamente e descubra oportunidades de fomento feitas para você
          </p>
          
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto" aria-label="Formulário de cadastro de email">
            <label htmlFor="footer-email" className="sr-only">Email</label>
            <Input 
              id="footer-email"
              type="email" 
              placeholder="Seu melhor email" 
              className="bg-white text-gray-900 border-0 h-12"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || success}
              required
              aria-required="true"
              aria-describedby="footer-email-description"
            />
            <span id="footer-email-description" className="sr-only">Digite seu endereço de email para receber atualizações</span>
            <Button 
              type="submit"
              size="lg" 
              variant="attention"
              className="px-8 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              disabled={loading || success}
              aria-label={loading ? "Processando cadastro" : success ? "Redirecionando para cadastro" : "Cadastrar gratuitamente"}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  Processando...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" aria-hidden="true" />
                  Redirecionando...
                </>
              ) : (
                "Cadastrar Grátis"
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Footer Content */}
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[linear-gradient(135deg,var(--attention),#ffffff)]">
                <span className="text-gray-950 font-bold text-sm">O</span>
              </div>
              <span className="text-xl font-bold">{APP_TITLE}</span>
            </div>
            <p className="text-gray-400 text-sm">
              Inteligência em Fomento e Subvenção
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold mb-4">Produto</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#como-funciona" className="hover:text-white transition-colors">Como Funciona</a></li>
              <li><a href="#planos" className="hover:text-white transition-colors">Planos</a></li>
              <li><Link href="/demo" className="hover:text-white transition-colors">Demonstração</Link></li>
              <li><Link href="/referencia" className="hover:text-white transition-colors">Programa de Referência</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold mb-4">Empresa</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/sobre" className="hover:text-white transition-colors">Sobre</Link></li>
              <li><Link href="/contato" className="hover:text-white transition-colors">Contato</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/politica-privacidade" className="hover:text-white transition-colors">Privacidade</Link></li>
              <li><Link href="/termos-de-uso" className="hover:text-white transition-colors">Termos de Uso</Link></li>
              <li><Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">
            © 2025 {APP_TITLE}. Todos os direitos reservados.
          </p>
          
          <div className="flex gap-4">
            <a href="#" className="text-gray-400 hover:text-white transition-colors">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">
              <Linkedin className="w-5 h-5" />
            </a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">
              <Github className="w-5 h-5" />
            </a>
            <a href="mailto:contato@origemlab.ai" className="text-gray-400 hover:text-white transition-colors">
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
