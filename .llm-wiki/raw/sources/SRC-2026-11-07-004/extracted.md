[ ]
[ ]

[Skip to content](#cryptographic-storage-cheat-sheet)

[![logo](../assets/OWASP_Logo.svg)](../index.html "OWASP Cheat Sheet Series")

OWASP Cheat Sheet Series

Cryptographic Storage

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
  + [ ]

    Cryptographic Storage

    [Cryptographic Storage](Cryptographic_Storage_Cheat_Sheet.html)

    Table of contents
    - [Introduction](#introduction)
    - [Architectural Design](#architectural-design)

      * [Where to Perform Encryption](#where-to-perform-encryption)
      * [Minimize the Storage of Sensitive Information](#minimize-the-storage-of-sensitive-information)
    - [Algorithms](#algorithms)

      * [Post-Quantum Consideration](#post-quantum-consideration)
      * [Custom Algorithms](#custom-algorithms)
      * [Cipher Modes](#cipher-modes)
      * [Random Padding](#random-padding)
      * [Secure Random Number Generation](#secure-random-number-generation)

        + [UUIDs and GUIDs](#uuids-and-guids)
      * [Defense in Depth](#defense-in-depth)
    - [Key Management](#key-management)

      * [Processes](#processes)
      * [Key Generation](#key-generation)
      * [Key Lifetimes and Rotation](#key-lifetimes-and-rotation)
    - [Key Storage](#key-storage)

      * [Separation of Keys and Data](#separation-of-keys-and-data)
      * [Encrypting Stored Keys](#encrypting-stored-keys)
    - [References](#references)
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
  + [File Upload](File_Upload_Cheat_Sheet.html)
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
* [Architectural Design](#architectural-design)

  + [Where to Perform Encryption](#where-to-perform-encryption)
  + [Minimize the Storage of Sensitive Information](#minimize-the-storage-of-sensitive-information)
* [Algorithms](#algorithms)

  + [Post-Quantum Consideration](#post-quantum-consideration)
  + [Custom Algorithms](#custom-algorithms)
  + [Cipher Modes](#cipher-modes)
  + [Random Padding](#random-padding)
  + [Secure Random Number Generation](#secure-random-number-generation)

    - [UUIDs and GUIDs](#uuids-and-guids)
  + [Defense in Depth](#defense-in-depth)
* [Key Management](#key-management)

  + [Processes](#processes)
  + [Key Generation](#key-generation)
  + [Key Lifetimes and Rotation](#key-lifetimes-and-rotation)
* [Key Storage](#key-storage)

  + [Separation of Keys and Data](#separation-of-keys-and-data)
  + [Encrypting Stored Keys](#encrypting-stored-keys)
* [References](#references)

# Cryptographic Storage Cheat Sheet[¶](#cryptographic-storage-cheat-sheet "Permanent link")

## Introduction[¶](#introduction "Permanent link")

This article provides a simple model to follow when implementing solutions to protect data at rest.

Passwords should not be stored using reversible encryption - secure password hashing algorithms should be used instead. The [Password Storage Cheat Sheet](Password_Storage_Cheat_Sheet.html) contains further guidance on storing passwords.

## Architectural Design[¶](#architectural-design "Permanent link")

The first step in designing any application is to consider the overall architecture of the system, as this will have a huge impact on the technical implementation.

This process should begin with considering the [threat model](Threat_Modeling_Cheat_Sheet.html) of the application (i.e, who you are trying to protect that data against).

The use of dedicated secret or key management systems can provide an additional layer of security protection, as well as making the management of secrets significantly easier - however it comes at the cost of additional complexity and administrative overhead - so may not be feasible for all applications. Note that many cloud environments provide these services, so these should be taken advantage of where possible. The [Secrets Management Cheat Sheet](Secrets_Management_Cheat_Sheet.html) contains further guidance on this topic.

### Where to Perform Encryption[¶](#where-to-perform-encryption "Permanent link")

Encryption can be performed on a number of levels in the application stack, such as:

* At the application level.
* At the database level (e.g, [SQL Server TDE](https://docs.microsoft.com/en-us/sql/relational-databases/security/encryption/transparent-data-encryption?view=sql-server-ver15))
* At the filesystem level (e.g, BitLocker or LUKS)
* At the hardware level (e.g, encrypted RAID cards or SSDs)

Which layer(s) are most appropriate will depend on the threat model. For example, hardware level encryption is effective at protecting against the physical theft of the server, but will provide no protection if an attacker is able to compromise the server remotely.

### Minimize the Storage of Sensitive Information[¶](#minimize-the-storage-of-sensitive-information "Permanent link")

The best way to protect sensitive information is to not store it in the first place. Although this applies to all kinds of information, it is most often applicable to credit card details, as they are highly desirable for attackers, and PCI DSS has such stringent requirements for how they must be stored. Wherever possible, the storage of sensitive information should be avoided.

## Algorithms[¶](#algorithms "Permanent link")

For symmetric encryption **AES** with a key that's at least **128 bits** (ideally **256 bits**) and a secure [mode](#cipher-modes) should be used as the preferred algorithm.

For public-key encryption, use a maintained library implementing an established hybrid encryption scheme, such as [Hybrid Public Key Encryption (HPKE)](https://www.rfc-editor.org/rfc/rfc9180.html#section-4), which combines key establishment, key derivation, and authenticated symmetric encryption. **[X25519 on Curve25519](https://www.rfc-editor.org/rfc/rfc7748.html#section-6.1)** is a key-agreement primitive; it does not encrypt stored data by itself. Select an appropriate [HPKE authentication mode](https://www.rfc-editor.org/rfc/rfc9180.html#section-5) if sender authentication is required; the base mode does not authenticate the sender. HPKE gives [only limited replay protection](https://www.rfc-editor.org/rfc/rfc9180.html#section-9.7.3), within a single context. If an attacker could resend a ciphertext, add your own replay check, such as a unique message ID the recipient tracks.

If **RSA** must be used, ensure that the key is at least **2048 bits**.

### Post-Quantum Consideration[¶](#post-quantum-consideration "Permanent link")

RSA and ECC-based public-key cryptography (including Curve25519) are not post-quantum secure. A future cryptographically relevant quantum computer could break them, which matters for data that must remain confidential over long periods.

Where post-quantum key establishment is required, use a supported protocol or library integration of a standardized mechanism such as **[ML-KEM (NIST FIPS 203)](https://csrc.nist.gov/pubs/fips/203/final)**, typically in a hybrid construction alongside a classical algorithm during migration. ML-KEM establishes a shared secret for symmetric encryption; it does not replace AES for encrypting stored data. Include the public-key protection of stored encryption keys in the migration plan.

For migration guidance, see the [Post-Quantum Cryptography Cheat Sheet](Post_Quantum_Cryptography_Cheat_Sheet.html).

When selecting cryptographic algorithms for a specific use case, consider:

* Key size.
* Known attacks and weaknesses of the algorithm.
* Maturity of the algorithm.
* Approval by third parties such as [NIST's algorithmic validation program](https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program).
* Performance (both for encryption and decryption).
* Quality of the libraries available.
* Portability of the algorithm (i.e, how widely supported is it).

In some cases there may be regulatory requirements that limit the algorithms that can be used, such as [FIPS 140-3](https://csrc.nist.gov/pubs/fips/140-3/final) or [PCI DSS](https://www.pcisecuritystandards.org/pci_security/glossary#Strong%20Cryptography).

### Custom Algorithms[¶](#custom-algorithms "Permanent link")

Don't do this.

### Cipher Modes[¶](#cipher-modes "Permanent link")

There are various [modes](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation) that can be used to allow block ciphers (such as AES) to encrypt arbitrary amounts of data, in the same way that a stream cipher would. These modes have different security and performance characteristics, and a full discussion of them is outside the scope of this cheat sheet. Some of the modes have requirements to generate secure initialization vectors (IVs) and other attributes, but these should be handled automatically by the library.

Where available, authenticated modes should always be used. These provide guarantees of the integrity and authenticity of the data, as well as confidentiality. The most commonly used authenticated modes are **[GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode)** and **[CCM](https://en.wikipedia.org/wiki/CCM_mode)**, which should be used as a first preference.

If GCM or CCM are not available, then [CTR](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#Counter_%28CTR%29) mode or [CBC](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#Cipher_Block_Chaining_%28CBC%29) mode should be used. As these do not provide any guarantees about the authenticity of the data, separate authentication should be implemented, such as using the [Encrypt-then-MAC](https://en.wikipedia.org/wiki/Authenticated_encryption#Encrypt-then-MAC_%28EtM%29) technique. Care needs to be taken when using this method with [variable length messages](https://en.wikipedia.org/wiki/CBC-MAC#Security_with_fixed_and_variable-length_messages)

[ECB](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#ECB) should not be used outside of very specific circumstances.

### Random Padding[¶](#random-padding "Permanent link")

For RSA encryption, use a maintained library's RSAES-OAEP (Optimal Asymmetric Encryption Padding) implementation, as specified in [RFC 8017, Section 7.1](https://www.rfc-editor.org/rfc/rfc8017.html#section-7.1). OAEP uses randomized encoding and mask generation functions; simply prepending random bytes to the message is not a substitute. Do not use RSA without an encryption padding scheme.

### Secure Random Number Generation[¶](#secure-random-number-generation "Permanent link")

Random numbers (or strings) are needed for various security critical functionality, such as generating encryption keys, IVs, session IDs, CSRF tokens or password reset tokens. As such, it is important that these are generated securely, and that it is not possible for an attacker to guess and predict them.

It is generally not possible for computers to generate truly random numbers (without special hardware), so most systems and languages provide two different types of randomness.

Pseudo-Random Number Generators (PRNG) provide low-quality randomness that are much faster, and can be used for non-security related functionality (such as ordering results on a page, or randomizing UI elements). However, they **must not** be used for anything security critical, as it is often possible for attackers to guess or predict the output.

Cryptographically Secure Pseudo-Random Number Generators (CSPRNG) are designed to produce a much higher quality of randomness (more strictly, a greater amount of entropy), making them safe to use for security-sensitive functionality. However, they are slower and more CPU intensive, can end up blocking in some circumstances when large amounts of random data are requested. As such, if large amounts of non-security related randomness are needed, they may not be appropriate.

The table below shows the recommended algorithms for each language, as well as insecure functions that should not be used.

| Language | Unsafe Functions | Cryptographically Secure Functions |
| --- | --- | --- |
| C | `random()`, `rand()` | [getrandom(2)](http://man7.org/linux/man-pages/man2/getrandom.2.html) |
| Java | `Math.random()`, `StrictMath.random()`, `java.util.Random`, `java.util.SplittableRandom`, `java.util.concurrent.ThreadLocalRandom` | [java.security.SecureRandom](https://docs.oracle.com/javase/8/docs/api/java/security/SecureRandom.html), [java.util.UUID.randomUUID()](https://docs.oracle.com/javase/8/docs/api/java/util/UUID.html#randomUUID--) |
| PHP | `array_rand()`, `lcg_value()`, `mt_rand()`, `rand()`, `uniqid()` | [Random\Engine\Secure](https://www.php.net/manual/en/class.random-engine-secure.php) in PHP 8.2, [random\_bytes()](https://www.php.net/manual/en/function.random-bytes.php), [random\_int()](https://www.php.net/manual/en/function.random-int.php) in PHP 7, [openssl\_random\_pseudo\_bytes()](https://www.php.net/manual/en/function.openssl-random-pseudo-bytes.php) in PHP 5 |
| .NET/C# | `Random()` | [RandomNumberGenerator](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.randomnumbergenerator?view=net-6.0) |
| Objective-C | Subclasses of `GKRandomSource`, `rand()`, `random()` | [SecRandomCopyBytes](https://developer.apple.com/documentation/security/1399291-secrandomcopybytes?language=objc), [the `arc4random` family on current Apple platforms](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/gen/FreeBSD/arc4random.3) |
| Python | `random()` | [secrets()](https://docs.python.org/3/library/secrets.html#module-secrets) |
| Ruby | `rand()`, `Random` | [SecureRandom](https://ruby-doc.org/stdlib-2.5.1/libdoc/securerandom/rdoc/SecureRandom.html) |
| Go | `rand` using `math/rand` package | [crypto.rand](https://golang.org/pkg/crypto/rand/) package |
| Rust | `rand::rngs::SmallRng` and the other generators the [`rand` docs](https://docs.rs/rand/0.10.3/rand/rngs/index.html) mark as insecure | [`rand::rng()`](https://docs.rs/rand/0.10.3/rand/rngs/struct.ThreadRng.html) (`ThreadRng`), [`rand::rngs::SysRng`](https://docs.rs/rand/0.10.3/rand/rngs/struct.SysRng.html) |
| Node.js | `Math.random()` | [crypto.randomBytes()](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback), [crypto.randomInt()](https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback), [crypto.randomUUID()](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) |

#### UUIDs and GUIDs[¶](#uuids-and-guids "Permanent link")

Universally unique identifiers (UUIDs or GUIDs) are sometimes used as a quick way to generate random strings. Although they can provide a reasonable source of randomness, this will depend on the [type or version](https://en.wikipedia.org/wiki/Universally_unique_identifier#Versions) of the UUID that is created.

Specifically, version 1 UUIDs are comprised of a high precision timestamp and the MAC address of the system that generated them, so are **not random** (although they may be hard to guess, given the timestamp is to the nearest 100ns). Type 4 UUIDs are randomly generated, although whether this is done using a CSPRNG will depend on the implementation. Unless this is known to be secure in the specific language or framework, the randomness of UUIDs should not be relied upon.

### Defense in Depth[¶](#defense-in-depth "Permanent link")

Applications should be designed to still be secure even if cryptographic controls fail. Any information that is stored in an encrypted form should also be protected by additional layers of security. Application should also not rely on the security of encrypted URL parameters, and should enforce strong access control to prevent unauthorized access to information.

## Key Management[¶](#key-management "Permanent link")

### Processes[¶](#processes "Permanent link")

Formal processes should be implemented (and tested) to cover all aspects of key management, including:

* Generating and storing new keys.
* Distributing keys to the required parties.
* Deploying keys to application servers.
* Rotating and decommissioning old keys

### Key Generation[¶](#key-generation "Permanent link")

Keys should be randomly generated using a cryptographically secure function, such as those discussed in the [Secure Random Number Generation](#secure-random-number-generation) section. Keys **should not** be based on common words or phrases, or on "random" characters generated by mashing the keyboard.

Where multiple keys are used (such as data separate data-encrypting and key-encrypting keys), they should be fully independent from each other.

### Key Lifetimes and Rotation[¶](#key-lifetimes-and-rotation "Permanent link")

Encryption keys should be changed (or rotated) based on a number of different criteria:

* If the previous key is known (or suspected) to have been compromised.
  + This could also be caused by a someone who had access to the key leaving the organization.
* After a specified period of time has elapsed (known as the cryptoperiod).
  + There are many factors that could affect what an appropriate cryptoperiod is, including the size of the key, the sensitivity of the data, and the threat model of the system. See section 5.3 of [NIST SP 800-57 Part 1 Rev. 5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final) for further guidance.
* Before reaching the usage limits of the selected encryption mode.
  + Enforce the mode's limits on message size, encryption operations, and initialization vector (IV) uniqueness across all instances sharing the key. Block size alone does not determine a safe data-volume limit. For example, AES-GCM has separate requirements for input lengths and IV construction in [NIST SP 800-38D, Sections 5.2.1.1 and 8](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf). See [Key Management: Cryptoperiods and Rotation](Key_Management_Cheat_Sheet.html#cryptoperiods-and-rotation) for usage-based rotation guidance.
* If there is a significant change to the security provided by the algorithm (such as a new attack being announced).

Once one of these criteria have been met, a new key should be generated and used for encrypting any new data. There are two main approaches for how existing data that was encrypted with the old key(s) should be handled:

1. Decrypting it and re-encrypting it with the new key.
2. Marking each item with the ID of the key that was used to encrypt it, and storing multiple keys to allow the old data to be decrypted.

The first option should generally be preferred, as it greatly simplifies both the application code and key management processes; however, it may not always be feasible. Note that old keys should generally be stored for a certain period after they have been retired, in case old backups of copies of the data need to be decrypted.

It is important that the code and processes required to rotate a key are in place **before** they are required, so that keys can be quickly rotated in the event of a compromise. Additionally, processes should also be implemented to allow the encryption algorithm or library to be changed, in case a new vulnerability is found in the algorithm or implementation.

## Key Storage[¶](#key-storage "Permanent link")

Securely storing cryptographic keys is one of the hardest problems to solve, as the application always needs to have some level of access to the keys in order to decrypt the data. While it may not be possible to fully protect the keys from an attacker who has fully compromised the application, a number of steps can be taken to make it harder for them to obtain the keys.

Where available, the secure storage mechanisms provided by the operating system, framework or cloud service provider should be used. These include:

* A physical Hardware Security Module (HSM).
* A virtual HSM.
* Key vaults such as [Amazon KMS](https://aws.amazon.com/kms/) or [Azure Key Vault](https://azure.microsoft.com/en-gb/services/key-vault/).
* An external secrets management service such as [Conjur](https://github.com/cyberark/conjur) or [HashiCorp Vault](https://github.com/hashicorp/vault).
* Secure storage APIs provided by the [ProtectedData](https://docs.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?redirectedfrom=MSDN&view=netframework-4.8) class in the .NET framework.

There are many advantages to using these types of secure storage over simply putting keys in configuration files. The specifics of these will vary depending on the solution used, but they include:

* Central management of keys, especially in containerised environments.
* Easy key rotation and replacement.
* Secure key generation.
* Simplifying compliance with regulatory standards such as FIPS 140 or PCI DSS.
* Making it harder for an attacker to export or steal keys.

In some cases none of these will be available, such as in a shared hosting environment, meaning that it is not possible to obtain a high degree of protection for any encryption keys. However, the following basic rules can still be followed:

* Do not hard-code keys into the application source code.
* Do not check keys into version control systems.
* Protect the configuration files containing the keys with restrictive permissions.
* Avoid storing keys in environment variables, as these can be accidentally exposed through functions such as [phpinfo()](https://www.php.net/manual/en/function.phpinfo.php) or through the `/proc/self/environ` file.

The [Secrets Management Cheat Sheet](Secrets_Management_Cheat_Sheet.html) provides more details on securely storing secrets.

### Separation of Keys and Data[¶](#separation-of-keys-and-data "Permanent link")

Where possible, encryption keys should be stored in a separate location from encrypted data. For example, if the data is stored in a database, the keys should be stored in the filesystem. This means that if an attacker only has access to one of these (for example through directory traversal or SQL injection), they cannot access both the keys and the data.

Depending on the architecture of the environment, it may be possible to store the keys and data on separate systems, which would provide a greater degree of isolation.

### Encrypting Stored Keys[¶](#encrypting-stored-keys "Permanent link")

Where possible, encryption keys should themselves be stored in an encrypted form. At least two separate keys are required for this:

* The Data Encryption Key (DEK) is used to encrypt the data.
* The Key Encryption Key (KEK) is used to encrypt the DEK.

For this to be effective, the KEK must be stored separately from the DEK. The encrypted DEK can be stored with the data, but will only be usable if an attacker is able to also obtain the KEK, which is stored on another system.

The KEK should also be at least as strong as the DEK. The [envelope encryption](https://cloud.google.com/kms/docs/envelope-encryption) guidance from Google contains further details on how to manage DEKs and KEKs.

In simpler application architectures (such as shared hosting environments) where the KEK and DEK cannot be stored separately, there is limited value to this approach, as an attacker is likely to be able to obtain both of the keys at the same time. However, it can provide an additional barrier to unskilled attackers.

A key derivation function (KDF) could be used to generate a KEK from user-supplied input (such a passphrase), which would then be used to encrypt a randomly generated DEK. This allows the KEK to be easily changed (when the user changes their passphrase), without needing to re-encrypt the data (as the DEK remains the same).

## References[¶](#references "Permanent link")

* [NIST SP 800-57 Part 1 Rev. 5: Recommendation for Key Management](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf)
* [NIST FIPS 203: Module-Lattice-Based Key-Encapsulation Mechanism Standard](https://csrc.nist.gov/pubs/fips/203/final)
* [NIST: Post-Quantum Cryptography FAQ](https://csrc.nist.gov/Projects/post-quantum-cryptography/faqs)

©Copyright  - Cheat Sheets Series Team - This work is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).

Made with
[Material for MkDocs](https://squidfunk.github.io/mkdocs-material/)
