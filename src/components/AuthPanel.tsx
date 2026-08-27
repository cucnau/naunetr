import React, { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup
} from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon, X, Mail, Lock, CheckCircle2, ShieldAlert, Loader2, Link, Eye, EyeOff } from 'lucide-react';

export const AuthPanel: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Tab within Auth Modal: 'login' | 'register'
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Linking states
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [showLinkPassword, setShowLinkPassword] = useState(false);

  // Status states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'auth/invalid-email':
        return 'Địa chỉ email không hợp lệ.';
      case 'auth/user-disabled':
        return 'Tài khoản này đã bị khóa.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email hoặc mật khẩu không chính xác.';
      case 'auth/email-already-in-use':
        return 'Địa chỉ email đã được sử dụng bởi một tài khoản khác.';
      case 'auth/weak-password':
        return 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
      case 'auth/credential-already-in-use':
        return 'Tài khoản này đã được liên kết với một tài khoản khác.';
      case 'auth/provider-already-linked':
        return 'Phương thức đăng nhập này đã được liên kết trước đó.';
      case 'auth/popup-blocked':
        return 'Trình duyệt đã chặn cửa sổ Popup. Vui lòng mở lại.';
      default:
        return 'Đã xảy ra lỗi. Vui lòng kiểm tra lại.';
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setIsAuthModalOpen(false);
    } catch (error: any) {
      console.error('Lỗi đăng nhập Google:', error);
      setErrorMsg(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setIsAuthModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Lỗi đăng nhập Email:', error);
      setErrorMsg(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setErrorMsg('Vui lòng nhập đầy đủ tất cả các trường.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Mật khẩu phải chứa ít nhất 6 ký tự.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setIsAuthModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Lỗi đăng ký Email:', error);
      setErrorMsg(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!linkEmail || !linkPassword) {
      setErrorMsg('Vui lòng nhập đầy đủ email và mật khẩu để liên kết.');
      return;
    }
    if (linkPassword.length < 6) {
      setErrorMsg('Mật khẩu phải chứa ít nhất 6 ký tự.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const credential = EmailAuthProvider.credential(linkEmail, linkPassword);
      await linkWithCredential(user, credential);
      setSuccessMsg('Đã liên kết tài khoản Email + Mật khẩu thành công!');
      setLinkEmail('');
      setLinkPassword('');
    } catch (error: any) {
      console.error('Lỗi liên kết Email:', error);
      setErrorMsg(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkGoogle = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(user, provider);
      setSuccessMsg('Đã liên kết tài khoản Google thành công!');
    } catch (error: any) {
      console.error('Lỗi liên kết Google:', error);
      setErrorMsg(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setIsSettingsModalOpen(false);
    } catch (error) {
      console.error('Lỗi đăng xuất:', error);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setLinkEmail('');
    setLinkPassword('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const isGoogleLinked = user?.providerData.some(p => p.providerId === 'google.com') || false;
  const isEmailLinked = user?.providerData.some(p => p.providerId === 'password') || false;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {user ? (
        <>
          {/* Settings/Account button */}
          <button 
            onClick={() => {
              resetForm();
              setIsSettingsModalOpen(true);
            }} 
            className="flex items-center justify-center text-[#D7CCC8] hover:text-[#FFECB3] hover:bg-[#5D4037] p-2 rounded-full border border-[#5D4037] transition-all duration-200 cursor-pointer" 
            title="Thiết lập tài khoản & Liên kết"
          >
            <UserIcon size={13} />
          </button>

          {/* Simple Logout Button */}
          <button 
            onClick={handleSignOut} 
            className="flex items-center justify-center text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] p-2 rounded-full border border-[#5D4037] transition-all duration-200 cursor-pointer" 
            title={`Đăng xuất (${user.displayName || user.email || 'User'})`}
          >
            <LogOut size={13} />
          </button>
        </>
      ) : (
        <button 
          onClick={() => {
            resetForm();
            setAuthTab('login');
            setIsAuthModalOpen(true);
          }} 
          className="flex items-center justify-center text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] p-2 rounded-full border border-[#5D4037] transition-all duration-200 cursor-pointer" 
          title="Đăng nhập (Email hoặc Google)"
        >
          <LogIn size={13} />
        </button>
      )}

      {/* LOGIN/REGISTER MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsAuthModalOpen(false)} />
          <div className="relative bg-[#FAFAFA] border border-[#D7CCC8] rounded-xl shadow-2xl w-full max-w-md overflow-hidden z-10 animate-in zoom-in-95 duration-200 text-[#3E2723]">
            {/* Header */}
            <div className="bg-[#4E342E] text-white px-5 py-4 flex items-center justify-between border-b border-[#3E2723]">
              <h3 className="text-sm font-bold tracking-wider text-[#FFECB3]">
                {authTab === 'login' ? 'ĐĂNG NHẬP HỆ THỐNG' : 'ĐĂNG KÝ TÀI KHOẢN'}
              </h3>
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                className="text-[#D7CCC8] hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Google Sign In Option */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-[#F5F5F5] text-[#3E2723] border border-[#D7CCC8] py-2.5 px-4 rounded-lg font-bold text-xs shadow-sm transition-all duration-150 mb-5 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.64 0 3.12.56 4.28 1.67l3.2-3.2C17.51 1.63 14.99 1 12 1 7.37 1 3.4 3.63 1.42 7.42l3.85 3C6.2 7.42 8.87 5.04 12 5.04z"/>
                  <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.39-4.88 3.39-8.5z"/>
                  <path fill="#FBBC05" d="M5.27 14.42c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29l-3.85-3C.54 8.42 0 10.15 0 12s.54 3.58 1.42 5.16l3.85-3.02z"/>
                  <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.66-2.84c-1.01.68-2.31 1.08-4.3 1.08-3.13 0-5.8-2.38-6.73-5.38l-3.85 3C3.4 20.37 7.37 23 12 23z"/>
                </svg>
                <span>TIẾP TỤC VỚI GOOGLE</span>
              </button>

              <div className="relative flex py-2 items-center mb-5">
                <div className="flex-grow border-t border-[#EFEBE9]"></div>
                <span className="flex-shrink mx-4 text-[10px] text-[#A1887F] font-bold uppercase tracking-wider">hoặc</span>
                <div className="flex-grow border-t border-[#EFEBE9]"></div>
              </div>

              {/* Email Form */}
              <form onSubmit={authTab === 'login' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider mb-1.5">Email</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#A1887F]">
                      <Mail size={14} />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vidu@email.com"
                      required
                      className="w-full bg-white border border-[#D7CCC8] rounded-lg py-2 pl-9 pr-4 text-xs text-[#3E2723] focus:outline-none focus:ring-1 focus:ring-[#8D6E63] focus:border-[#8D6E63]"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider mb-1.5">Mật khẩu</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#A1887F]">
                      <Lock size={14} />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mật khẩu tối thiểu 6 ký tự"
                      required
                      className="w-full bg-white border border-[#D7CCC8] rounded-lg py-2 pl-9 pr-10 text-xs text-[#3E2723] focus:outline-none focus:ring-1 focus:ring-[#8D6E63] focus:border-[#8D6E63]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#A1887F] hover:text-[#5D4037] cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password (Register only) */}
                {authTab === 'register' && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider mb-1.5">Xác nhận mật khẩu</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#A1887F]">
                        <Lock size={14} />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu"
                        required
                        className="w-full bg-white border border-[#D7CCC8] rounded-lg py-2 pl-9 pr-10 text-xs text-[#3E2723] focus:outline-none focus:ring-1 focus:ring-[#8D6E63] focus:border-[#8D6E63]"
                      />
                    </div>
                  </div>
                )}

                {/* Error message */}
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg flex items-start gap-2 text-xs">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#5D4037] hover:bg-[#4E342E] text-white py-2.5 px-4 rounded-lg font-bold text-xs shadow-md transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {loading && <Loader2 size={13} className="animate-spin" />}
                  <span>{authTab === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'}</span>
                </button>
              </form>

              {/* Toggle Tab */}
              <div className="mt-5 text-center">
                {authTab === 'login' ? (
                  <p className="text-[11px] text-[#5D4037]">
                    Chưa có tài khoản?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setAuthTab('register');
                      }}
                      className="font-bold underline text-[#3E2723] hover:text-[#5D4037] cursor-pointer"
                    >
                      Đăng ký ngay
                    </button>
                  </p>
                ) : (
                  <p className="text-[11px] text-[#5D4037]">
                    Đã có tài khoản?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setAuthTab('login');
                      }}
                      className="font-bold underline text-[#3E2723] hover:text-[#5D4037] cursor-pointer"
                    >
                      Đăng nhập tại đây
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT SETTINGS & LINKING MODAL */}
      {isSettingsModalOpen && user && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsSettingsModalOpen(false)} />
          <div className="relative bg-[#FAFAFA] border border-[#D7CCC8] rounded-xl shadow-2xl w-full max-w-md overflow-hidden z-10 animate-in zoom-in-95 duration-200 text-[#3E2723]">
            {/* Header */}
            <div className="bg-[#4E342E] text-white px-5 py-4 flex items-center justify-between border-b border-[#3E2723]">
              <h3 className="text-sm font-bold tracking-wider text-[#FFECB3]">THIẾT LẬP TÀI KHOẢN</h3>
              <button 
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-[#D7CCC8] hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* User Profile Summary */}
              <div className="bg-[#FFFDF7] border border-[#EFEBE9] p-4 rounded-lg flex items-center gap-3">
                <div className="bg-[#FFECB3] text-[#5D4037] p-2 rounded-full">
                  <UserIcon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider">Tài khoản hiện tại</p>
                  <p className="text-xs font-bold text-[#3E2723] truncate">{user.email || 'Ẩn danh'}</p>
                  {user.displayName && <p className="text-[10px] text-[#A1887F]">{user.displayName}</p>}
                </div>
              </div>

              {/* Link Provider Status */}
              <div>
                <h4 className="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider mb-2.5">Trạng thái liên kết</h4>
                <div className="space-y-2">
                  {/* Google Status */}
                  <div className="flex items-center justify-between bg-white border border-[#EFEBE9] p-2.5 rounded-lg text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.08-.2-.14-.42-.19-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                      <span>Tài khoản Google</span>
                    </div>
                    {isGoogleLinked ? (
                      <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full flex items-center gap-1 select-none">
                        <CheckCircle2 size={10} /> ĐÃ LIÊN KẾT
                      </span>
                    ) : (
                      <button
                        onClick={handleLinkGoogle}
                        disabled={loading}
                        className="text-[10px] font-bold text-[#5D4037] hover:text-white bg-[#FFECB3]/40 hover:bg-[#5D4037] border border-[#D7CCC8] px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        LIÊN KẾT NGAY
                      </button>
                    )}
                  </div>

                  {/* Email Status */}
                  <div className="flex items-center justify-between bg-white border border-[#EFEBE9] p-2.5 rounded-lg text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <Mail size={14} className="text-[#A1887F]" />
                      <span>Email & Mật khẩu</span>
                    </div>
                    {isEmailLinked ? (
                      <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full flex items-center gap-1 select-none">
                        <CheckCircle2 size={10} /> ĐÃ LIÊN KẾT
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-[#A1887F] bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full select-none">
                        CHƯA LIÊN KẾT
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Form to link Email + Password (if not linked) */}
              {!isEmailLinked && (
                <div className="bg-white border border-[#D7CCC8] p-4 rounded-lg space-y-3.5">
                  <h4 className="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider flex items-center gap-1">
                    <Link size={12} /> Thiết lập liên kết Email mới
                  </h4>
                  <form onSubmit={handleLinkEmailPassword} className="space-y-3">
                    <div>
                      <label className="block text-[9px] font-bold text-[#A1887F] uppercase tracking-wider mb-1">Email liên kết</label>
                      <input
                        type="email"
                        value={linkEmail}
                        onChange={(e) => setLinkEmail(e.target.value)}
                        placeholder="email-moi@gmail.com"
                        required
                        className="w-full bg-white border border-[#D7CCC8] rounded-lg py-1.5 px-3 text-xs text-[#3E2723] focus:outline-none focus:ring-1 focus:ring-[#8D6E63] focus:border-[#8D6E63]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#A1887F] uppercase tracking-wider mb-1">Mật khẩu thiết lập</label>
                      <div className="relative">
                        <input
                          type={showLinkPassword ? 'text' : 'password'}
                          value={linkPassword}
                          onChange={(e) => setLinkPassword(e.target.value)}
                          placeholder="Mật khẩu tối thiểu 6 ký tự"
                          required
                          className="w-full bg-white border border-[#D7CCC8] rounded-lg py-1.5 pl-3 pr-10 text-xs text-[#3E2723] focus:outline-none focus:ring-1 focus:ring-[#8D6E63] focus:border-[#8D6E63]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLinkPassword(!showLinkPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#A1887F] hover:text-[#5D4037] cursor-pointer"
                        >
                          {showLinkPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#5D4037] hover:bg-[#4E342E] text-white py-2 px-4 rounded-lg font-bold text-xs shadow-md transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {loading && <Loader2 size={12} className="animate-spin" />}
                      <span>LIÊN KẾT EMAIL & MẬT KHẨU</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Status notifications */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg flex items-start gap-2 text-xs">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="bg-green-50 border border-green-200 text-green-700 p-2.5 rounded-lg flex items-start gap-2 text-xs">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Sign Out Action */}
              <div className="border-t border-[#EFEBE9] pt-4 flex justify-between">
                <span />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>ĐĂNG XUẤT</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
