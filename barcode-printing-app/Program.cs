using System;
using System.Windows.Forms;

namespace BarcodePrintingApp
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            
            using (var login = new LoginForm())
            {
                if (login.ShowDialog() == DialogResult.OK)
                {
                    Application.Run(new MainForm(login.Token, login.User));
                }
                else
                {
                    Application.Exit();
                }
            }
        }
    }
}
