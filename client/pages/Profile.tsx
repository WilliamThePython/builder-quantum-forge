import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, Calendar, Shield, Crown, Edit, Save, X, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, updateProfile, deleteAccount, signOut, isPremium, error, clearError } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-800 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-gray-400 mb-6">Please sign in to view your profile.</p>
          <Link to="/">
            <Button className="bg-blue-600 hover:bg-blue-700">
              Go to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSaveProfile = async () => {
    if (!displayName.trim()) return;
    
    setIsLoading(true);
    clearError();
    
    try {
      await updateProfile({ displayName: displayName.trim() });
      setIsEditing(false);
    } catch (error) {
      console.error('Profile update error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    try {
      await deleteAccount();
      // User will be redirected after account deletion
    } catch (error) {
      console.error('Account deletion error:', error);
      setIsLoading(false);
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

  const formatDate = (date: string | null) => {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const userDisplayName = user.displayName || user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-800 text-white">
      {/* Header */}
      <header className="relative z-10 p-6">
        <Link to="/">
          <Button 
            variant="outline" 
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Viewer
          </Button>
        </Link>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        {error && (
          <Alert className="mb-6 border-red-500/50 bg-red-500/10">
            <AlertDescription className="text-red-400">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Header */}
        <div className="text-center mb-12">
          <div className="relative inline-block">
            <Avatar className="w-24 h-24 mx-auto mb-4 border-4 border-white/20">
              <AvatarImage src={user.photoURL || undefined} alt={userDisplayName} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl">
                {getInitials(userDisplayName)}
              </AvatarFallback>
            </Avatar>
            
            {isPremium && (
              <div className="absolute -top-2 -right-2">
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                  <Crown className="w-3 h-3 mr-1" />
                  Premium
                </Badge>
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold mb-2">{userDisplayName}</h1>
          <p className="text-gray-400 mb-4">{user.email}</p>
          
          {!isPremium && (
            <Badge variant="secondary" className="bg-gray-700 text-gray-300">
              <Shield className="w-3 h-3 mr-1" />
              Free Account
            </Badge>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Profile Information */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white flex items-center">
                <User className="w-5 h-5 mr-2" />
                Profile Information
              </CardTitle>
              
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false);
                      setDisplayName(user.displayName || '');
                    }}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveProfile}
                    disabled={isLoading || !displayName.trim()}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-300">Display Name</Label>
                {isEditing ? (
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 bg-white/10 border-white/20 text-white"
                    placeholder="Enter your display name"
                  />
                ) : (
                  <p className="text-white mt-1">{user.displayName || 'Not set'}</p>
                )}
              </div>

              <div>
                <Label className="text-gray-300">Email Address</Label>
                <p className="text-white mt-1">{user.email}</p>
              </div>

              <div>
                <Label className="text-gray-300">Account Created</Label>
                <p className="text-white mt-1 flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  {formatDate(user.metadata.creationTime)}
                </p>
              </div>

              <div>
                <Label className="text-gray-300">Last Sign In</Label>
                <p className="text-white mt-1">
                  {formatDate(user.metadata.lastSignInTime)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Account Settings */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Account Settings
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {!isPremium && (
                <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-lg">
                  <h3 className="font-semibold text-yellow-400 mb-2 flex items-center">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Premium
                  </h3>
                  <p className="text-gray-300 text-sm mb-3">
                    Unlock advanced 3D tools, unlimited projects, and priority support.
                  </p>
                  <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white">
                    Upgrade Now
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                >
                  Change Password
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                >
                  Download My Data
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-gray-500/30 text-gray-400 hover:bg-gray-500/10"
                >
                  Privacy Settings
                </Button>
              </div>

              {/* Danger Zone */}
              <div className="pt-4 border-t border-red-500/20">
                <h4 className="text-red-400 font-semibold mb-3">Danger Zone</h4>
                
                {!showDeleteConfirm ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-red-300 text-sm">
                      This action cannot be undone. All your data will be permanently deleted.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 border-gray-500/30 text-gray-400"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDeleteAccount}
                        disabled={isLoading}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      >
                        {isLoading ? 'Deleting...' : 'Delete Forever'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
