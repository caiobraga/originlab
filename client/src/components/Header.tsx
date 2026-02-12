import { useState } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Menu, LogIn, LogOut, FileText, User, LayoutDashboard, ChevronDown, Sparkles, Share2 } from "lucide-react";
import { APP_TITLE } from "@/const";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import SkipLink from "@/components/SkipLink";

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
    <>
      <SkipLink />
      <header 
        className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md"
        role="banner"
        id="navigation"
      >
      <div className="container">
        <div className="flex h-14 md:h-16 items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/inicio" aria-label={`${APP_TITLE} - Página inicial`}>
            <div className="flex items-center gap-1.5 md:gap-2 cursor-pointer flex-shrink-0 min-w-0 group transition-all duration-200 hover:opacity-80">
              <div 
                className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:shadow-md"
                aria-hidden="true"
              >
                <span className="text-white font-bold text-xs md:text-sm">O</span>
              </div>
              <span className="text-base md:text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent truncate transition-all duration-200">
                {APP_TITLE}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation - Apenas quando não logado */}
          {!user && !loading && (
            <nav 
              className="hidden md:flex items-center gap-8"
              role="navigation"
              aria-label="Navegação principal"
            >
              <a 
                href="#como-funciona" 
                className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-all duration-200 hover:scale-105 relative group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:rounded"
              >
                Como Funciona
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 transition-all duration-200 group-hover:w-full" aria-hidden="true"></span>
              </a>
              <a 
                href="#planos" 
                className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-all duration-200 hover:scale-105 relative group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:rounded"
              >
                Planos
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 transition-all duration-200 group-hover:w-full" aria-hidden="true"></span>
              </a>
              <a 
                href="#depoimentos" 
                className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-all duration-200 hover:scale-105 relative group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:rounded"
              >
                Depoimentos
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 transition-all duration-200 group-hover:w-full" aria-hidden="true"></span>
              </a>
            </nav>
          )}

          {/* Desktop Navigation - Quando logado */}
          {user && !loading && (
            <nav 
              className="hidden md:flex items-center gap-1"
              role="navigation"
              aria-label="Navegação do usuário"
            >
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 px-3 text-sm font-medium transition-all duration-200 group",
                    isActive("/dashboard")
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600"
                      : "text-gray-700 hover:text-blue-600 hover:bg-gray-50 hover:scale-105"
                  )}
                  aria-current={isActive("/dashboard") ? "page" : undefined}
                >
                  <LayoutDashboard className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                  Meu Painel
                </Button>
              </Link>
              <Link href="/minhas-propostas">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 px-3 text-sm font-medium transition-all duration-200 group",
                    isActive("/minhas-propostas")
                      ? "bg-violet-50 text-violet-600 hover:bg-violet-50 hover:text-violet-600"
                      : "text-gray-700 hover:text-violet-600 hover:bg-gray-50 hover:scale-105"
                  )}
                  aria-current={isActive("/minhas-propostas") ? "page" : undefined}
                >
                  <FileText className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                  Minhas Propostas
                </Button>
              </Link>
              <Link href="/referencia">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 px-3 text-sm font-medium transition-all duration-200 group",
                    isActive("/referencia")
                      ? "bg-green-50 text-green-600 hover:bg-green-50 hover:text-green-600"
                      : "text-gray-700 hover:text-green-600 hover:bg-gray-50 hover:scale-105"
                  )}
                  aria-current={isActive("/referencia") ? "page" : undefined}
                >
                  <Share2 className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                  Indique e Ganhe
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
                    className="h-9 px-2 md:px-3 gap-1.5 md:gap-2 hover:bg-gray-50 transition-all duration-200"
                    type="button"
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    aria-expanded={profileMenuOpen}
                    aria-haspopup="true"
                    aria-label={`Menu do usuário: ${user.email}`}
                  >
                    <div 
                      className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-semibold text-xs md:text-sm flex-shrink-0 transition-transform duration-200 hover:scale-110 hover:shadow-md"
                      aria-hidden="true"
                    >
                      {user.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-gray-500 transition-all duration-200 flex-shrink-0", profileMenuOpen && "rotate-180")} aria-hidden="true" />
                  </Button>
                  
                  {profileMenuOpen && (
                    <div 
                      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200"
                      role="menu"
                      aria-label="Menu do usuário"
                    >
                      <div className="p-3 border-b border-gray-200 bg-gray-50">
                        <div className="flex flex-col space-y-1 min-w-0">
                          <p className="text-sm font-semibold leading-none text-gray-900">Minha Conta</p>
                          <p className="text-xs leading-none text-gray-600 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <div className="py-1">
                        <button
                          onClick={() => handleNavigate("/perfil")}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-all duration-200 cursor-pointer text-left hover:translate-x-1 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                          role="menuitem"
                        >
                          <User className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                          Meu Perfil
                        </button>
                        <button
                          onClick={() => handleNavigate("/referencia")}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-all duration-200 cursor-pointer text-left hover:translate-x-1 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                          role="menuitem"
                        >
                          <Share2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                          Indique e Ganhe
                        </button>
                        <div className="h-px bg-gray-200 my-1" aria-hidden="true" />
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-all duration-200 cursor-pointer text-left hover:translate-x-1 group focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-inset"
                          role="menuitem"
                        >
                          <LogOut className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                          Sair
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              !loading && (
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
              )
            )}
            
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden"
                  aria-label="Abrir menu de navegação"
                  aria-expanded="false"
                >
                  <Menu className="w-5 h-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[400px] overflow-y-auto">
                <div className="flex flex-col gap-4 mt-8">
                  {/* Mobile Navigation */}
                  <nav className="flex flex-col gap-4" role="navigation" aria-label="Navegação mobile">
                    <a 
                      href="#como-funciona" 
                      className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:rounded"
                    >
                      Como Funciona
                    </a>
                    <a 
                      href="#planos" 
                      className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:rounded"
                    >
                      Planos
                    </a>
                    <a 
                      href="#depoimentos" 
                      className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:rounded"
                    >
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
                        <Link href="/referencia">
                          <Button 
                            variant={isActive("/referencia") ? "secondary" : "ghost"}
                            className="w-full justify-start"
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Indique e Ganhe
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
                        <Link href="/login">
                          <Button 
                            variant="outline" 
                            className="w-full"
                          >
                            <LogIn className="w-4 h-4 mr-2" />
                            Entrar
                          </Button>
                        </Link>
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
    </>
  );
}
