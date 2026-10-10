using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ClockClockDesktop {
  public static int Main(string[] args) {
    try {
      if(args.Length<1)throw new Exception("Missing window handle");
      IntPtr window=new IntPtr(long.Parse(args[0]));
      bool check=args.Length>1 && args[1]=="check";
      long parent=check?GetParent(window).ToInt64():Attach(window,args);
      Console.WriteLine("{\"attached\":"+(Attached(window)?"true":"false")+",\"parent\":"+parent+",\"parentClass\":\""+Class(GetParent(window))+"\",\"valid\":"+(IsWindow(window)?"true":"false")+"}");
      return 0;
    } catch(Exception error) {Console.Error.WriteLine(error.Message);return 1;}
  }
  public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder value, int max);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr h, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetLong(IntPtr h, int index, IntPtr value);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [StructLayout(LayoutKind.Sequential)] struct RECT {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct POINT {public int X,Y;}
  public static string Class(IntPtr h) {var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
  public static bool Attached(IntPtr h) {var p=GetParent(h);return IsWindow(h)&&IsWindow(p)&&(Class(p)=="WorkerW"||Class(p)=="Progman");}
  public static long Attach(IntPtr h, string[] args) {
    if (!IsWindow(h)) throw new Exception("Wallpaper window is no longer available");
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    IntPtr progman=FindWindow("Progman",null), result;
    if (progman==IntPtr.Zero) throw new Exception("Windows desktop is not ready");
    SendMessageTimeout(progman,0x052C,new IntPtr(0xD),IntPtr.Zero,2,1000,out result);
    SendMessageTimeout(progman,0x052C,new IntPtr(0xD),new IntPtr(1),2,1000,out result);
    IntPtr worker=IntPtr.Zero;
    EnumWindows((top,param)=>{
      if(FindWindowEx(top,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero) {
        worker=FindWindowEx(IntPtr.Zero,top,"WorkerW",null);
      }
      return true;
    },IntPtr.Zero);
    // Recent Windows 11 builds can host WorkerW below Progman's icon view.
    if(worker==IntPtr.Zero) worker=FindWindowEx(progman,IntPtr.Zero,"WorkerW",null);
    if(worker==IntPtr.Zero) throw new Exception("No wallpaper layer found; use the clock window or Wallpaper Engine");
    RECT rect;GetWindowRect(h,out rect);
    if(args.Length==6){rect.Left=int.Parse(args[2]);rect.Top=int.Parse(args[3]);rect.Right=rect.Left+int.Parse(args[4]);rect.Bottom=rect.Top+int.Parse(args[5]);}
    POINT origin=new POINT{X=rect.Left,Y=rect.Top};ScreenToClient(worker,ref origin);
    long style=GetLong(h,-16).ToInt64();SetLong(h,-16,new IntPtr((style&~0x80000000L)|0x40000000L));
    SetLong(h,-20,new IntPtr((GetLong(h,-20).ToInt64()|0x80L|0x08000000L)&~0x40000L));
    SetParent(h,worker);
    if(GetParent(h)!=worker) throw new Exception("Cannot attach wallpaper to desktop");
    SetWindowPos(h,IntPtr.Zero,origin.X,origin.Y,rect.Right-rect.Left,rect.Bottom-rect.Top,0x0010|0x0020|0x0040);
    return worker.ToInt64();
  }
}
