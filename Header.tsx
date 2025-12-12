import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, LogIn, LogOut, FileText, Gift } from "lucide-react";
import { APP_TITLE } from "@/const";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import PushNotifications from "./PushNotifications";

export default function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [, setLocation] = useLocation();

  const handleLogin = () => {
    setLocation("/onboarding");
    toast.success("Vamos começar!");
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    toast.info("Logout realizado");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="container">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">O</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                {APP_TITLE}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#como-funciona" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
              Como Funciona
            </a>
            <a href="#planos" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
              Planos
            </a>
            <a href="#depoimentos" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
              Depoimentos
            </a>
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                <PushNotifications />
                <Link href="/dashboard">
                  <Button variant="outline" className="hidden md:inline-flex border-blue-600 text-blue-600 hover:bg-blue-50">
                    Meu Painel
                  </Button>
                </Link>
                <Link href="/minhas-propostas">
                  <Button variant="outline" className="hidden md:inline-flex border-violet-600 text-violet-600 hover:bg-violet-50">
                    <FileText className="w-4 h-4 mr-2" />
                    Propostas
                  </Button>
                </Link>
                <Link href="/referencia">
                  <Button className="hidden md:inline-flex bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold">
                    <Gift className="w-4 h-4 mr-2" />
                    Ganhe R$ 50
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="hidden md:inline-flex"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  className="hidden md:inline-flex"
                  onClick={handleLogin}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Entrar
                </Button>
                <Button 
                  className="hidden md:inline-flex bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold"
                  onClick={handleLogin}
                >
                  Criar Conta Grátis
                </Button>
              </>
            )}
            
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
