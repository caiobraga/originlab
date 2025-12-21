import { useState } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Menu, LogIn, LogOut, FileText, User, LayoutDashboard, ChevronDown, Sparkles } from "lucide-react";
import { APP_TITLE } from "@/const";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Header() {
  const { user, signOut, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await signOut();
    setProfileMenuOpen(false);
  };

  const handleNavigate = (path: string) => {
    setLocation(path);
    setProfileMenuOpen(false);
  };

  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  // Fechar menu quando clicar fora
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [profileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="container">
        <div className="flex h-14 md:h-16 items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-1.5 md:gap-2 cursor-pointer flex-shrink-0 min-w-0">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs md:text-sm">O</span>
              </div>
              <span className="text-base md:text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent truncate">
                {APP_TITLE}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation - Apenas quando não logado */}
          {!user && !loading && (
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
          )}

          {/* Desktop Navigation - Quando logado */}
          {user && !loading && (
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 px-3 text-sm font-medium transition-colors",
                    isActive("/dashboard")
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600"
                      : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
                  )}
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Meu Painel
                </Button>
              </Link>
              <Link href="/minhas-propostas">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 px-3 text-sm font-medium transition-colors",
                    isActive("/minhas-propostas")
                      ? "bg-violet-50 text-violet-600 hover:bg-violet-50 hover:text-violet-600"
                      : "text-gray-600 hover:text-violet-600 hover:bg-gray-50"
                  )}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Minhas Propostas
                </Button>
              </Link>
            </nav>
          )}

          {/* CTA Buttons */}
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {!loading && user ? (
              <>
                {/* Badge Plano Pro */}
                <Badge 
                  variant="default"
                  className="hidden md:inline-flex bg-gradient-to-r from-blue-600 to-violet-600 text-white border-0 px-3 py-1.5 font-medium shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Plano Pro
                </Badge>

                {/* Menu do Usuário */}
                <div className="relative hidden md:block" ref={profileMenuRef}>
                  <Button 
                    variant="ghost" 
                    className="h-9 px-2 md:px-3 gap-1.5 md:gap-2 hover:bg-gray-50"
                    type="button"
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  >
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-semibold text-xs md:text-sm flex-shrink-0">
                      {user.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform flex-shrink-0", profileMenuOpen && "rotate-180")} />
                  </Button>
                  
                  {profileMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] overflow-hidden">
                      <div className="p-3 border-b border-gray-200 bg-gray-50">
                        <div className="flex flex-col space-y-1 min-w-0">
                          <p className="text-sm font-semibold leading-none text-gray-900">Minha Conta</p>
                          <p className="text-xs leading-none text-gray-500 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <div className="py-1">
                        <button
                          onClick={() => handleNavigate("/perfil")}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer text-left"
                        >
                          <User className="w-4 h-4" />
                          Meu Perfil
                        </button>
                        <div className="h-px bg-gray-200 my-1" />
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
                        >
                          <LogOut className="w-4 h-4" />
                          Sair
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              !loading && (
                <>
                  <Link href="/login">
                    <Button 
                      variant="outline" 
                      className="hidden md:inline-flex"
                      size="sm"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Entrar
                    </Button>
                  </Link>
                  <Link href="/cadastro">
                    <Button 
                      className="hidden md:inline-flex bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                      size="sm"
                    >
                      <span className="hidden lg:inline">Criar Conta Grátis</span>
                      <span className="lg:hidden">Cadastrar</span>
                    </Button>
                  </Link>
                </>
              )
            )}
            
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[400px] overflow-y-auto">
                <div className="flex flex-col gap-4 mt-8">
                  {/* Mobile Navigation */}
                  <nav className="flex flex-col gap-4">
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

                  <div className="border-t border-gray-200 pt-4 mt-4">
                    {!loading && user ? (
                      <div className="flex flex-col gap-3">
                        <Badge 
                          variant="default"
                          className="w-full justify-center bg-gradient-to-r from-blue-600 to-violet-600 text-white border-0 py-2 font-medium"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                          Plano Pro
                        </Badge>
                        <Link href="/dashboard">
                          <Button 
                            variant={isActive("/dashboard") ? "secondary" : "ghost"}
                            className="w-full justify-start"
                          >
                            <LayoutDashboard className="w-4 h-4 mr-2" />
                            Meu Painel
                          </Button>
                        </Link>
                        <Link href="/minhas-propostas">
                          <Button 
                            variant={isActive("/minhas-propostas") ? "secondary" : "ghost"}
                            className="w-full justify-start"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Minhas Propostas
                          </Button>
                        </Link>
                        <Link href="/perfil">
                          <Button 
                            variant={isActive("/perfil") ? "secondary" : "ghost"}
                            className="w-full justify-start"
                          >
                            <User className="w-4 h-4 mr-2" />
                            Meu Perfil
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost"
                          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={handleLogout}
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Sair
                        </Button>
                      </div>
                    ) : (
                      !loading && (
                        <div className="flex flex-col gap-3">
                          <Link href="/login">
                            <Button 
                              variant="outline" 
                              className="w-full"
                            >
                              <LogIn className="w-4 h-4 mr-2" />
                              Entrar
                            </Button>
                          </Link>
                          <Link href="/cadastro">
                            <Button 
                              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                            >
                              Criar Conta Grátis
                            </Button>
                          </Link>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
