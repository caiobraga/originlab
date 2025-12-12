import { Button } from "@/components/ui/button";
import { Menu, LogIn, LogOut, FileText, User } from "lucide-react";
import { APP_TITLE } from "@/const";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Header() {
  const { user, signOut, loading } = useAuth();

  const handleLogout = async () => {
    await signOut();
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
            {!loading && user ? (
              <>
                <Link href="/minhas-propostas">
                  <Button variant="outline" className="hidden md:inline-flex border-violet-600 text-violet-600 hover:bg-violet-50">
                    <FileText className="w-4 h-4 mr-2" />
                    Minhas Propostas
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" className="hidden md:inline-flex border-blue-600 text-blue-600 hover:bg-blue-50">
                    Meu Painel
                  </Button>
                </Link>
                <Link href="/perfil">
                  <Button variant="outline" className="hidden md:inline-flex border-green-600 text-green-600 hover:bg-green-50">
                    <User className="w-4 h-4 mr-2" />
                    Meu Perfil
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
              !loading && (
                <>
                  <Link href="/login">
                    <Button 
                      variant="outline" 
                      className="hidden md:inline-flex"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Entrar
                    </Button>
                  </Link>
                  <Link href="/cadastro">
                    <Button 
                      className="hidden md:inline-flex bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                    >
                      Criar Conta Grátis
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
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
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
                        <Link href="/minhas-propostas">
                          <Button variant="outline" className="w-full border-violet-600 text-violet-600 hover:bg-violet-50">
                            <FileText className="w-4 h-4 mr-2" />
                            Minhas Propostas
                          </Button>
                        </Link>
                        <Link href="/dashboard">
                          <Button variant="outline" className="w-full border-blue-600 text-blue-600 hover:bg-blue-50">
                            Meu Painel
                          </Button>
                        </Link>
                        <Link href="/perfil">
                          <Button variant="outline" className="w-full border-green-600 text-green-600 hover:bg-green-50">
                            <User className="w-4 h-4 mr-2" />
                            Meu Perfil
                          </Button>
                        </Link>
                        <Button 
                          variant="outline" 
                          className="w-full"
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
