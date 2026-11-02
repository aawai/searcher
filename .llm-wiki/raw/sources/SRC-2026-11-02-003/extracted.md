[ ]
[ ]

[Skip to content](#file-upload-cheat-sheet)

[![logo](../assets/OWASP_Logo.svg)](../index.html "OWASP Cheat Sheet Series")

OWASP Cheat Sheet Series

File Upload

Initializing search

[OWASP/CheatSheetSeries](https://github.com/OWASP/CheatSheetSeries "Go to repository")

[![logo](../assets/OWASP_Logo.svg)](../index.html "OWASP Cheat Sheet Series")
OWASP Cheat Sheet Series

[OWASP/CheatSheetSeries](https://github.com/OWASP/CheatSheetSeries "Go to repository")

* [Introduction](../index.html)
* [Index Alphabetical](../Glossary.html)
* [Index ASVS](../IndexASVS.html)
* [Index MASVS](../IndexMASVS.html)
* [Index Proactive Controls](../IndexProactiveControls.html)
* [Index Top 10](../IndexTopTen.html)
* [x]

  Cheatsheets

  Cheatsheets
  + [AI-Powered Advertising Systems Security](AI-Powered_Advertising_Systems_Security_Cheat_Sheet.html)
  + [AI Agent Security](AI_Agent_Security_Cheat_Sheet.html)
  + [AML Sanctions AI Agent Payments](AML_Sanctions_AI_Agent_Payments_Cheat_Sheet.html)
  + [Abuse Case](Abuse_Case_Cheat_Sheet.html)
  + [Access Control](Access_Control_Cheat_Sheet.html)
  + [Attack Surface Analysis](Attack_Surface_Analysis_Cheat_Sheet.html)
  + [Authentication](Authentication_Cheat_Sheet.html)
  + [Authentication Patterns](Authentication_Patterns_Cheat_Sheet.html)
  + [Authorization](Authorization_Cheat_Sheet.html)
  + [Authorization Decisions And Output Handling](Authorization_Decisions_And_Output_Handling_Cheat_Sheet.html)
  + [Authorization Patterns](Authorization_Patterns_Cheat_Sheet.html)
  + [Authorization Policy And Data Distribution](Authorization_Policy_And_Data_Distribution_Cheat_Sheet.html)
  + [Authorization Regression Testing](Authorization_Regression_Testing_Cheat_Sheet.html)
  + [Authorization Testing Automation](Authorization_Testing_Automation_Cheat_Sheet.html)
  + [Automotive Security](Automotive_Security_Cheat_Sheet.html)
  + [Bean Validation](Bean_Validation_Cheat_Sheet.html)
  + [Bot Management and Anti-Automation](Bot_Management_and_Anti-Automation_Cheat_Sheet.html)
  + [Browser Extension Vulnerabilities](Browser_Extension_Vulnerabilities_Cheat_Sheet.html)
  + [Business Logic Security](Business_Logic_Security_Cheat_Sheet.html)
  + [C-Based Toolchain Hardening](C-Based_Toolchain_Hardening_Cheat_Sheet.html)
  + [CI CD Security](CI_CD_Security_Cheat_Sheet.html)
  + [Choosing and Using Security Questions](Choosing_and_Using_Security_Questions_Cheat_Sheet.html)
  + [Clickjacking Defense](Clickjacking_Defense_Cheat_Sheet.html)
  + [Content Security Policy](Content_Security_Policy_Cheat_Sheet.html)
  + [Cookie Theft Mitigation](Cookie_Theft_Mitigation_Cheat_Sheet.html)
  + [Credential Stuffing Prevention](Credential_Stuffing_Prevention_Cheat_Sheet.html)
  + [Cross-Site Request Forgery Prevention](Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
  + [Cross Site Scripting Prevention](Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
  + [Cryptographic Storage](Cryptographic_Storage_Cheat_Sheet.html)
  + [DOM Clobbering Prevention](DOM_Clobbering_Prevention_Cheat_Sheet.html)
  + [DOM based XSS Prevention](DOM_based_XSS_Prevention_Cheat_Sheet.html)
  + [Database Security](Database_Security_Cheat_Sheet.html)
  + [Denial of Service](Denial_of_Service_Cheat_Sheet.html)
  + [Dependency Graph SBOM](Dependency_Graph_SBOM_Cheat_Sheet.html)
  + [Deserialization](Deserialization_Cheat_Sheet.html)
  + [Django REST Framework](Django_REST_Framework_Cheat_Sheet.html)
  + [Django Security](Django_Security_Cheat_Sheet.html)
  + [Docker Security](Docker_Security_Cheat_Sheet.html)
  + [DotNet Security](DotNet_Security_Cheat_Sheet.html)
  + [Drone Security](Drone_Security_Cheat_Sheet.html)
  + [Email Validation and Verification](Email_Validation_and_Verification_Cheat_Sheet.html)
  + [Error Handling](Error_Handling_Cheat_Sheet.html)
  + [FastAPI Security](FastAPI_Security_Cheat_Sheet.html)
  + [ ]

    File Upload

    [File Upload](File_Upload_Cheat_Sheet.html)

    Table of contents
    - [Introduction](#introduction)
    - [File Upload Threats](#file-upload-threats)

      * [Malicious Files](#malicious-files)
      * [Public File Retrieval](#public-file-retrieval)
    - [File Upload Protection](#file-upload-protection)

      * [Extension Validation](#extension-validation)

        + [List Allowed Extensions](#list-allowed-extensions)
        + [Block Extensions](#block-extensions)
      * [Content-Type Validation](#content-type-validation)
      * [File Signature Validation](#file-signature-validation)
      * [Filename Safety](#filename-safety)
      * [File Content Validation](#file-content-validation)
      * [File Storage Location](#file-storage-location)
      * [User Permissions](#user-permissions)
      * [Filesystem Permissions](#filesystem-permissions)
      * [Upload and Download Limits](#upload-and-download-limits)
    - [Java Code Snippets](#java-code-snippets)
    - [References](#references)
  + [Forgot Password](Forgot_Password_Cheat_Sheet.html)
  + [GitHub Actions Security](GitHub_Actions_Security_Cheat_Sheet.html)
  + [GraphQL](GraphQL_Cheat_Sheet.html)
  + [HTML5 Security](HTML5_Security_Cheat_Sheet.html)
  + [HTTP Headers](HTTP_Headers_Cheat_Sheet.html)
  + [HTTP Strict Transport Security](HTTP_Strict_Transport_Security_Cheat_Sheet.html)
  + [Identity Propagation Patterns](Identity_Propagation_Patterns_Cheat_Sheet.html)
  + [Infrastructure as Code Security](Infrastructure_as_Code_Security_Cheat_Sheet.html)
  + [Injection Prevention](Injection_Prevention_Cheat_Sheet.html)
  + [Injection Prevention in Java](Injection_Prevention_in_Java_Cheat_Sheet.html)
  + [Input Validation](Input_Validation_Cheat_Sheet.html)
  + [Insecure Direct Object Reference Prevention](Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
  + [JAAS](JAAS_Cheat_Sheet.html)
  + [JSON Web Token](JSON_Web_Token_Cheat_Sheet.html)
  + [JavaScript and TypeScript Security](JavaScript_and_TypeScript_Security_Cheat_Sheet.html)
  + [Java Security](Java_Security_Cheat_Sheet.html)
  + [Key Management](Key_Management_Cheat_Sheet.html)
  + [Kubernetes Security](Kubernetes_Security_Cheat_Sheet.html)
  + [LDAP Injection Prevention](LDAP_Injection_Prevention_Cheat_Sheet.html)
  + [LLM Prompt Injection Prevention](LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
  + [Laravel](Laravel_Cheat_Sheet.html)
  + [Legacy Application Management](Legacy_Application_Management_Cheat_Sheet.html)
  + [Logging](Logging_Cheat_Sheet.html)
  + [Logging Vocabulary](Logging_Vocabulary_Cheat_Sheet.html)
  + [MCP Security](MCP_Security_Cheat_Sheet.html)
  + [Mass Assignment](Mass_Assignment_Cheat_Sheet.html)
  + [Micro Frontend Security](Micro_Frontend_Security_Cheat_Sheet.html)
  + [Microservices Security](Microservices_Security_Cheat_Sheet.html)
  + [Microservices based Security Arch Doc](Microservices_based_Security_Arch_Doc_Cheat_Sheet.html)
  + [Mobile Application Security](Mobile_Application_Security_Cheat_Sheet.html)
  + [Multi Tenant Security](Multi_Tenant_Security_Cheat_Sheet.html)
  + [Multifactor Authentication](Multifactor_Authentication_Cheat_Sheet.html)
  + [NPM Security](NPM_Security_Cheat_Sheet.html)
  + [Network Segmentation](Network_Segmentation_Cheat_Sheet.html)
  + [Nextjs Security](Nextjs_Security_Cheat_Sheet.html)
  + [NoSQL Security](NoSQL_Security_Cheat_Sheet.html)
  + [NodeJS Docker](NodeJS_Docker_Cheat_Sheet.html)
  + [Nodejs Security](Nodejs_Security_Cheat_Sheet.html)
  + [OAuth2](OAuth2_Cheat_Sheet.html)
  + [OS Command Injection Defense](OS_Command_Injection_Defense_Cheat_Sheet.html)
  + [PHP Configuration](PHP_Configuration_Cheat_Sheet.html)
  + [Passkey Security](Passkey_Security_Cheat_Sheet.html)
  + [Password Storage](Password_Storage_Cheat_Sheet.html)
  + [Pinning](Pinning_Cheat_Sheet.html)
  + [Post Quantum Cryptography](Post_Quantum_Cryptography_Cheat_Sheet.html)
  + [Prototype Pollution Prevention](Prototype_Pollution_Prevention_Cheat_Sheet.html)
  + [Query Parameterization](Query_Parameterization_Cheat_Sheet.html)
  + [RAG Security](RAG_Security_Cheat_Sheet.html)
  + [REST Assessment](REST_Assessment_Cheat_Sheet.html)
  + [REST Security](REST_Security_Cheat_Sheet.html)
  + [Ruby on Rails](Ruby_on_Rails_Cheat_Sheet.html)
  + [SAML Security](SAML_Security_Cheat_Sheet.html)
  + [SQL Injection Prevention](SQL_Injection_Prevention_Cheat_Sheet.html)
  + [Secrets Management](Secrets_Management_Cheat_Sheet.html)
  + [Secure AI Model Ops](Secure_AI_Model_Ops_Cheat_Sheet.html)
  + [Secure Cloud Architecture](Secure_Cloud_Architecture_Cheat_Sheet.html)
  + [Secure Code Review](Secure_Code_Review_Cheat_Sheet.html)
  + [Secure Coding with AI](Secure_Coding_with_AI_Cheat_Sheet.html)
  + [Secure Product Design](Secure_Product_Design_Cheat_Sheet.html)
  + [Security Terminology](Security_Terminology_Cheat_Sheet.html)
  + [Server Side Request Forgery Prevention](Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
  + [Server Side Template Injection Prevention](Server_Side_Template_Injection_Prevention_Cheat_Sheet.html)
  + [Serverless FaaS Security](Serverless_FaaS_Security_Cheat_Sheet.html)
  + [Session Management](Session_Management_Cheat_Sheet.html)
  + [Software Supply Chain Security](Software_Supply_Chain_Security_Cheat_Sheet.html)
  + [Subdomain Takeover Prevention](Subdomain_Takeover_Prevention_Cheat_Sheet.html)
  + [Symfony](Symfony_Cheat_Sheet.html)
  + [TLS Cipher String](TLS_Cipher_String_Cheat_Sheet.html)
  + [Third Party Javascript Management](Third_Party_Javascript_Management_Cheat_Sheet.html)
  + [Third Party Payment Gateway Integration](Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html)
  + [Threat Modeling](Threat_Modeling_Cheat_Sheet.html)
  + [Transaction Authorization](Transaction_Authorization_Cheat_Sheet.html)
  + [Transport Layer Protection](Transport_Layer_Protection_Cheat_Sheet.html)
  + [Transport Layer Security](Transport_Layer_Security_Cheat_Sheet.html)
  + [Unvalidated Redirects and Forwards](Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
  + [User Privacy Protection](User_Privacy_Protection_Cheat_Sheet.html)
  + [Verifying Third Party Agent Execution Evidence](Verifying_Third_Party_Agent_Execution_Evidence_Cheat_Sheet.html)
  + [Virtual Patching](Virtual_Patching_Cheat_Sheet.html)
  + [Vulnerability Disclosure](Vulnerability_Disclosure_Cheat_Sheet.html)
  + [Vulnerable Dependency Management](Vulnerable_Dependency_Management_Cheat_Sheet.html)
  + [WebSocket Security](WebSocket_Security_Cheat_Sheet.html)
  + [Web Cache Security](Web_Cache_Security_Cheat_Sheet.html)
  + [Web Frontend Security](Web_Frontend_Security_Cheat_Sheet.html)
  + [Web Service Security](Web_Service_Security_Cheat_Sheet.html)
  + [Webhook Security](Webhook_Security_Cheat_Sheet.html)
  + [Workload Identity Federation](Workload_Identity_Federation_Cheat_Sheet.html)
  + [XML External Entity Prevention](XML_External_Entity_Prevention_Cheat_Sheet.html)
  + [XML Security](XML_Security_Cheat_Sheet.html)
  + [XPath Injection Prevention](XPath_Injection_Prevention_Cheat_Sheet.html)
  + [XSS Filter Evasion](XSS_Filter_Evasion_Cheat_Sheet.html)
  + [XS Leaks](XS_Leaks_Cheat_Sheet.html)
  + [Zero Trust Architecture](Zero_Trust_Architecture_Cheat_Sheet.html)
  + [gRPC Security](gRPC_Security_Cheat_Sheet.html)

Table of contents

* [Introduction](#introduction)
* [File Upload Threats](#file-upload-threats)

  + [Malicious Files](#malicious-files)
  + [Public File Retrieval](#public-file-retrieval)
* [File Upload Protection](#file-upload-protection)

  + [Extension Validation](#extension-validation)

    - [List Allowed Extensions](#list-allowed-extensions)
    - [Block Extensions](#block-extensions)
  + [Content-Type Validation](#content-type-validation)
  + [File Signature Validation](#file-signature-validation)
  + [Filename Safety](#filename-safety)
  + [File Content Validation](#file-content-validation)
  + [File Storage Location](#file-storage-location)
  + [User Permissions](#user-permissions)
  + [Filesystem Permissions](#filesystem-permissions)
  + [Upload and Download Limits](#upload-and-download-limits)
* [Java Code Snippets](#java-code-snippets)
* [References](#references)

# File Upload Cheat Sheet[¶](#file-upload-cheat-sheet "Permanent link")

## Introduction[¶](#introduction "Permanent link")

File upload is becoming a more and more essential part of any application, where the user is able to upload their photo, their CV, or a video showcasing a project they are working on. The application should be able to fend off bogus and malicious files in a way to keep the application and the users safe.

In short, the following principles should be followed to reach a secure file upload implementation:

* **List allowed extensions. Only allow safe and critical extensions for business functionality**
  + **Ensure that [input validation](Input_Validation_Cheat_Sheet.html#file-upload-validation) is applied before validating the extensions.**
* **Validate the file type, don't trust the [Content-Type header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type) as it can be spoofed**
* **Change the filename to something generated by the application**
* **Set a filename length limit. Restrict the allowed characters if possible**
* **Set a file size limit**
* **Only allow authorized users to upload files**
* **Store the files on a different server. If that's not possible, store them outside of the webroot**
  + **In the case of public access to the files, use a handler that gets mapped to filenames inside the application (someid -> file.ext)**
* **Run the file through an antivirus or a sandbox if available to validate that it doesn't contain malicious data**
* **Run the file through CDR (Content Disarm & Reconstruct) if applicable type (PDF, DOCX, etc...)**
* **Ensure that any libraries used are securely configured and kept up to date**
* **Protect the file upload from [CSRF](Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) attacks**

## File Upload Threats[¶](#file-upload-threats "Permanent link")

In order to assess and know exactly what controls to implement, knowing what you're facing is essential to protect your assets. The following sections will hopefully showcase the risks accompanying the file upload functionality.

### Malicious Files[¶](#malicious-files "Permanent link")

The attacker delivers a file for malicious intent, such as:

1. Exploit vulnerabilities in the file parser or processing module (*e.g.* [ImageTrick Exploit](https://imagetragick.com/), [XXE](https://owasp.org/www-community/vulnerabilities/XML_External_Entity_%28XXE%29_Processing))
2. Use the file for phishing (*e.g.* careers form)
3. Send ZIP bombs, XML bombs (otherwise known as billion laughs attack), or simply huge files in a way to fill the server storage which hinders and damages the server's availability
4. Overwrite an existing file on the system
5. Client-side active content (XSS, CSRF, etc.) that could endanger other users if the files are publicly retrievable.

### Public File Retrieval[¶](#public-file-retrieval "Permanent link")

If the file uploaded is publicly retrievable, additional threats can be addressed:

1. Public disclosure of other files
2. Initiate a DoS attack by requesting lots of files. Requests are small, yet responses are much larger
3. File content that could be deemed as illegal, offensive, or dangerous (*e.g.* personal data, copyrighted data, etc.) which will make you a host for such malicious files.

## File Upload Protection[¶](#file-upload-protection "Permanent link")

There is no silver bullet in validating user content. Implementing a defense in depth approach is key to make the upload process harder and more locked down to the needs and requirements for the service. Implementing multiple techniques is key and recommended, as no one technique is enough to secure the service.

### Extension Validation[¶](#extension-validation "Permanent link")

Ensure that the validation occurs after decoding the filename, and that a proper filter is set in place in order to avoid certain known bypasses, such as the following:

* Double extensions, *e.g.* `.jpg.php`, where it circumvents easily the regex `\.jpg`
* Null bytes, *e.g.* `.php%00.jpg`, where `.jpg` gets truncated and `.php` becomes the new extension
* Case manipulation, *e.g.* `.pHp`, `.phP`, to bypass case-sensitive blocklist filters
* Alternative extensions that may be mapped to the same server-side interpreter depending on configuration, *e.g.* `.phtml`, `.php5`, `.pht` for PHP, or `.jsp`/`.jspx`, `.asp`/`.aspx` for Java/.NET ([PortSwigger](https://portswigger.net/web-security/file-upload))
* Windows NTFS Alternate Data Streams, *e.g.* `shell.asp:.jpg` or `shell.php::$DATA`, where the colon is interpreted as a stream separator and the actual file created on disk carries the extension before the colon - reject any filename containing a colon (`:`) ([OWASP - Unrestricted File Upload](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload))
* Generic bad regex that isn't properly tested and well reviewed. Refrain from building your own logic unless you have enough knowledge on this topic.

Refer to the [Input Validation CS](Input_Validation_Cheat_Sheet.html) to properly parse and process the extension.

#### List Allowed Extensions[¶](#list-allowed-extensions "Permanent link")

Ensure the usage of *business-critical* extensions only, without allowing any type of *non-required* extensions. For example if the system requires:

* image upload, allow one type that is agreed upon to fit the business requirement;
* cv upload, allow `docx` and `pdf` extensions.

Based on the needs of the application, ensure the **least harmful** and the **lowest risk** file types to be used.

#### Block Extensions[¶](#block-extensions "Permanent link")

Identify potentially harmful file types and block extensions that you regard harmful to your service.

Please be aware that blocking specific extensions is a weak protection method on its own. The [Unrestricted File Upload vulnerability](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload) article describes how attackers may attempt
to bypass such a check.

### Content-Type Validation[¶](#content-type-validation "Permanent link")

*The Content-Type for uploaded files is provided by the user, and as such cannot be trusted, as it is trivial to spoof. Although it should not be relied upon for security, it provides a quick check to prevent users from unintentionally uploading files with the incorrect type.*

Other than defining the extension of the uploaded file, its MIME-type can be checked for a quick protection against simple file upload attacks.

This can be done preferably in an allowlist approach; otherwise, this can be done in a denylist approach.

### File Signature Validation[¶](#file-signature-validation "Permanent link")

In conjunction with [content-type validation](#content-type-validation), validating the file's signature can be checked and verified against the expected file that should be received.

> This should not be used on its own, as bypassing it is pretty common and easy.

### Filename Safety[¶](#filename-safety "Permanent link")

Filenames can endanger the system in multiple ways, either by using non acceptable characters, or by using special and restricted filenames. For Windows, refer to the following [MSDN guide](https://docs.microsoft.com/en-us/windows/win32/fileio/naming-a-file?redirectedfrom=MSDN#naming-conventions). For a wider overview on different filesystems and how they treat files, refer to [Wikipedia's Filename page](https://en.wikipedia.org/wiki/Filename).

In order to avoid the above mentioned threat, creating a **random string** as a filename, such as generating a UUID/GUID, is essential. If the filename is required by the business needs, proper input validation should be done for client-side (*e.g.* active content that results in XSS and CSRF attacks) and back-end side (*e.g.* special files overwrite or creation) attack vectors. Filename length limits should be taken into consideration based on the system storing the files, as each system has its own filename length limit. If user filenames are required, consider implementing the following:

* Implement a maximum length
* Restrict characters to an allowed subset specifically, such as alphanumeric characters, hyphen, spaces, and periods
  + Consider telling the user what an acceptable filename is.
  + Restrict use of leading periods (hidden files) and sequential periods (directory traversal).
  + Restrict the use of a leading hyphen or spaces to make it safer to use shell scripts to process files.
  + If this is not possible, block-list dangerous characters that could endanger the framework and system that is storing and using the files.

On Windows/NTFS, a long filename may have an [8.3 short name alias](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#short-vs-long-names), depending on file system settings. Do not assume that an alias exists or has a particular spelling. If an overwrite or collision check validates only the long filename supplied by the user, an attacker who can predict the short alias of an existing sensitive file may reference it directly to overwrite that file, bypassing an exact-name or extension check. Generating the stored filename server-side, as recommended above, removes this risk, since the attacker no longer controls which file is targeted. Disabling [short-name creation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-behavior#parameters) prevents new aliases; it does not remove existing aliases. Assess existing short names separately before relying on this setting: Microsoft documents [removal and compatibility checks](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-8dot3name), including backup precautions before removal.

### File Content Validation[¶](#file-content-validation "Permanent link")

As mentioned in the [Public File Retrieval](#public-file-retrieval) section, file content can contain malicious, inappropriate, or illegal data.

Based on the expected type, special file content validation can be applied:

* For **images**, decode and re-encode to an allowed image format, explicitly [removing unnecessary metadata](https://imagemagick.org/command-line-options/#strip). Rewriting does not guarantee that all malicious content is removed, and the image processor itself handles untrusted input. Use an up-to-date library with [restricted formats, resource limits, and sandboxing](https://imagemagick.org/security-policy/#other).
* For **Microsoft documents**, the usage of [Apache POI](https://poi.apache.org/) helps validating the uploaded documents.
* **ZIP files** are not recommended since they can contain all types of files, and the attack vectors pertaining to them are numerous.

The File Upload service should allow users to report illegal content, and copyright owners to report abuse.

If there are enough resources, manual file review should be conducted in a sandboxed environment before releasing the files to the public.

Adding some automation to the review could be helpful, which is a harsh process and should be well studied before its usage. Some services (*e.g.* Virus Total) provide APIs to scan files against well known malicious file hashes. Some frameworks can check and validate the raw content type and validating it against predefined file types, such as in [ASP.NET Drawing Library](https://docs.microsoft.com/en-us/dotnet/api/system.drawing.imaging.imageformat). Beware of data leakage threats and information gathering by public services.

### File Storage Location[¶](#file-storage-location "Permanent link")

The location where the files should be stored must be chosen based on security and business requirements. The following points are set by security priority, and are inclusive:

1. Store the files on a **different host**, which allows for complete segregation of duties between the application serving the user, and the host handling file uploads and their storage.
2. Store the files **outside the webroot**, where only administrative access is allowed.
3. Store the files **inside the webroot**, and set them in write permissions only.
   - If read access is required, setting proper controls is a must (*e.g.* internal IP, authorized user, etc.)

Storing files in a studied manner in databases is one additional technique. This is sometimes used for automatic backup processes, non file-system attacks, and permissions issues. In return, this opens up the door to performance issues (in some cases), storage considerations for the database and its backups, and this opens up the door to SQLi attack. This is advised only when a DBA is on the team and that this process shows to be an improvement on storing them on the file-system.

Be aware that an attacker may attempt to upload a web server configuration file (*e.g.* `.htaccess`, `web.config`) into the upload directory. If the web server allows per-directory configuration overrides, such a file could be used to change how that directory handles file types, for example mapping an otherwise harmless extension to be executed by the server. As a second layer of defense, disable per directory configuration overrides on upload directories at the web server level (*e.g.* Apache `AllowOverride None`, locked IIS handler mappings), in addition to storing files outside the webroot as recommended above.

> Some files are emailed or processed once they are uploaded, and are not stored on the server. It is essential to conduct the security measures discussed in this sheet before doing any actions on them.

### User Permissions[¶](#user-permissions "Permanent link")

Before any file upload service is accessed, proper validation should occur on two levels for the user uploading a file:

* Authentication level
  + The user should be a registered user, or an identifiable user, in order to set restrictions and limitations for their upload capabilities
* Authorization level
  + The user should have appropriate permissions to access or modify the files

### Filesystem Permissions[¶](#filesystem-permissions "Permanent link")

> Set the files permissions on the principle of least privilege.

Files should be stored in a way that ensures:

* Allowed system users are the only ones capable of reading the files
* Required modes only are set for the file
  + If execution is required, scanning the file before running it is required as a security best practice, to ensure that no macros or hidden scripts are available.

### Upload and Download Limits[¶](#upload-and-download-limits "Permanent link")

The application should set proper size limits for the upload service in order to protect the file storage capacity. If the system is going to extract the files or process them, the file size limit should be considered after file decompression is conducted and by using secure methods to calculate zip files size. For more on this, see how to [Safely extract files from ZipInputStream](https://wiki.sei.cmu.edu/confluence/display/java/IDS04-J.%2BSafely%2Bextract%2Bfiles%2Bfrom%2BZipInputStream), Java's input stream to handle ZIP files.

The application should set proper request limits as well for the download service if available to protect the server from DoS attacks.

## Java Code Snippets[¶](#java-code-snippets "Permanent link")

[Document Upload Protection](https://github.com/righettod/document-upload-protection) repository written by Dominique for certain document types in Java.

## References[¶](#references "Permanent link")

* [Microsoft: Upload Files in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/mvc/models/file-uploads?view=aspnetcore-6.0)
* [CWE-434: Unrestricted Upload of File with Dangerous Type](https://cwe.mitre.org/data/definitions/434.html)

©Copyright  - Cheat Sheets Series Team - This work is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).

Made with
[Material for MkDocs](https://squidfunk.github.io/mkdocs-material/)
