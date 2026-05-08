import pymupdf as fitz
import tkinter as tk
from tkinter  import filedialog,messagebox
import json
from pathlib import Path
import time as t




personalised_cartoon_folder=r"D:\rhymes app\rhymes\per_cartoon"
personalised_non_cartoon_folder=r"D:\rhymes app\rhymes\per"
nonpersonalised_folder=r"D:\rhymes app\rhymes\non_p_default"
rhymes_json=""
binder_json_path=""

def upload_rhyme_json():
    global rhyme_file_info_label
    global rhymes_json
    file_path = filedialog.askopenfilename(
        title="Select a file",
        filetypes=[
            
            ("json file", "*.json"),
            
        ]
    )
    rhyme_file_info_label.config(text=file_path,fg="blue") if file_path else rhyme_file_info_label.config(text="please upload file",fg="red")
    with open(file_path,"r",encoding="utf-8") as f:
            data = json.load(f)
    rhymes_json=data



def upload_binder_json():
    global binder_json_path,binder_file_info_label
    file_path = filedialog.askopenfilename(
        title="Select a file",
        filetypes=[
            
            ("json file", "*.json"),
            
        ]
    )
    
    binder_file_info_label.config(text=file_path,fg="blue") if file_path else binder_file_info_label.config(text="please upload file",fg="red")
    with open(file_path,"r",encoding="utf-8") as f:
            data = json.load(f)
    binder_json_path=data
    


    


def generate_binder():
    
    
  
    if not (binder_json_path and rhymes_json):
       messagebox.showerror("kindly upload all files ")
    
    rhyme_selection_data=binder_json_path["rhymes"]
   
    personalisation_data=binder_json_path["books"]["personalisation"]
    
    
    for grade,value in rhyme_selection_data.items():
        parent_doc =fitz.open()
        persoanlisation_value =personalisation_data[grade]
        
        
        if  isinstance(value,list):
            
            for item in value :
                
                            
                if isinstance(item,list) :
                    
                    
                    folder_path=compute_folder_path(item,rhymes_json,persoanlisation_value)
                    
              
                    
                    if len(item)==1:
                        
                      
    
                        full_doc = fitz.open(folder_path+"\\"+item[0]+".pdf")
                        parent_doc.insert_pdf(full_doc, from_page=0, to_page=0)
                        full_doc.close()
                        break
                        
                        
                    else:
                        top_doc = fitz.open(folder_path+"\\"+item[0]+".pdf") 
                        bottom_doc = fitz.open(folder_path+"\\"+item[1]+".pdf") 
                        page = parent_doc.new_page(width=595, height=842)

                        top_rect = fitz.Rect(0, 0, 595, 421)
                        bottom_rect = fitz.Rect(0, 421, 595, 842)

                        page.show_pdf_page(top_rect, top_doc, 0)
                        page.show_pdf_page(bottom_rect, bottom_doc, 0)

                        top_doc.close()
                        bottom_doc.close()
                        
         
            

                    
                    
                    
                    
        parent_doc.save(f"D:/{grade}.pdf")
        parent_doc.close()
    
   
        
    
            
        
    
def compute_folder_path(item,rhyme_json,persoanlisation_value,):
   
    print(personalised_cartoon_folder)
    
    for rhyme_code in item:
       
        rhyme_personalisation=rhyme_json[rhyme_code][2]
        
      
    if  (persoanlisation_value and  rhyme_personalisation ):
            
        folder_path =personalised_non_cartoon_folder
    elif  persoanlisation_value and not rhyme_personalisation:
        folder_path=nonpersonalised_folder
    else:
        folder_path=personalised_cartoon_folder
    
        
    return folder_path

      

root = tk.Tk()
root.title("rhyme  booklet generator ")
root.geometry("300x300")

upload_btn2=tk.Button(root, text="Upload rhymes json ", command=upload_rhyme_json)
upload_btn2.pack(padx=40,pady=30)
rhyme_file_info_label=tk.Label(root, text="No file selected", wraplength=450, justify="left")
rhyme_file_info_label.pack(pady=5)
upload_btn1 = tk.Button(root, text="Upload binder json", command=upload_binder_json)
upload_btn1.pack(padx=60,pady=30)
binder_file_info_label=tk.Label(root, text="No file selected", wraplength=450, justify="left")
binder_file_info_label.pack(pady=5)

submit_btn=tk.Button(root,text="run",command=generate_binder)
submit_btn.pack(padx=65,pady=10)

    

    



        
    



# btn = tk.Button(root, text="Choose Folder", command=select_folder)
# btn.pack(pady=20)


# folder_label = tk.Label(root, text="No folder selected", wraplength=450, justify="left")
# folder_label.pack(pady=10)








root.mainloop()


