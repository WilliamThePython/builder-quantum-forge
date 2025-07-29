import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  User, 
  Settings, 
  Crown, 
  LogOut, 
  ChevronDown,
  Edit3,
  Trash2,
  Shield
} from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { useAuth } from '../../context/AuthContext';

export default function UserProfile() {
  const { user, signOut, isPremium } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="h-auto p-2 bg-white/10 hover:bg-white/20 text-white border border-white/20"
        >
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.photoURL || undefined} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            
            <div className="hidden md:block text-left">
              <div className="text-sm font-medium">{displayName}</div>
              <div className="text-xs text-white/70">{user.email}</div>
            </div>
            
            <ChevronDown className="w-4 h-4" />
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 bg-white/95 backdrop-blur-sm border-white/20">
        <DropdownMenuLabel className="pb-2">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user.photoURL || undefined} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">{displayName}</div>
              <div className="text-sm text-gray-500 truncate">{user.email}</div>
              
              <div className="flex items-center gap-2 mt-1">
                {isPremium ? (
                  <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    Free
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <Link to="/profile">
          <DropdownMenuItem className="cursor-pointer">
            <User className="w-4 h-4 mr-3" />
            Profile Settings
          </DropdownMenuItem>
        </Link>

        <Link to="/account">
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="w-4 h-4 mr-3" />
            Account Settings
          </DropdownMenuItem>
        </Link>

        {!isPremium && (
          <>
            <DropdownMenuSeparator />
            <Link to="/upgrade">
              <DropdownMenuItem className="cursor-pointer text-yellow-600">
                <Crown className="w-4 h-4 mr-3" />
                Upgrade to Premium
              </DropdownMenuItem>
            </Link>
          </>
        )}

        <DropdownMenuSeparator />

        <Link to="/projects">
          <DropdownMenuItem className="cursor-pointer">
            <Edit3 className="w-4 h-4 mr-3" />
            My Projects
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator />

        <DropdownMenuItem 
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          {isSigningOut ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent mr-3"></div>
              Signing out...
            </div>
          ) : (
            <>
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
