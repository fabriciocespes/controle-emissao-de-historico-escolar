Option Explicit
Dim sh, fso, pasta, q, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(pasta & "\node.exe") Or Not fso.FileExists(pasta & "\server.js") Then
  MsgBox "Instalacao incompleta. Desinstale o programa e instale novamente.", vbCritical, "Controle de Historico Escolar"
  WScript.Quit 1
End If

sh.CurrentDirectory = pasta
q = Chr(34)
cmd = q & pasta & "\node.exe" & q & " " & q & pasta & "\server.js" & q
sh.Run cmd, 0, False
WScript.Sleep 3000
sh.Run "http://localhost:3000", 1, False
