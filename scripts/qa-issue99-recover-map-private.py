"""Prepare ZERO-model-call immutable Map QA recovery from existing real vectors.

Read-only Cloudflare Wrangler CLI. All fetched raw metadata and 768-D
embeddings are processed in memory and written only to ephemeral private
GitHub runner disk. Nothing is printed except fixed PASS/FAIL codes.
"""
import hashlib,json,math,os,pathlib,re,subprocess,sys
ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC"
FILE="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz"
JOB="drive:"+ROOT
BRANCH="refs/heads/qa/issue99-late-map-recovery-20261115"
INDICES={"legacy":"elevator-help-staging-test","multilingual":"elevator-help-staging-test-v2"}
def check(yes,code):
    if not yes:raise RuntimeError(code)
def load_json_output(value):
    value=re.sub(r"\x1b\[[0-9;]*m","",value)
    try:return json.loads(value)
    except ValueError:pass
    decoder=json.JSONDecoder()
    for i,ch in enumerate(value):
        if ch not in "{[":continue
        try:obj,end=decoder.raw_decode(value[i:])
        except ValueError:continue
        if isinstance(obj,list) and all(isinstance(x,dict) for x in obj):
            return obj
        if isinstance(obj,dict) and (isinstance(obj.get("result"),(list,dict)) or "vectors" in obj):
            return obj
    raise RuntimeError("QA_RECOVERY_CLI_JSON_UNPARSEABLE")
def run_wrangler(*args):
    run=subprocess.run(["npx","wrangler","vectorize",*args],capture_output=True,
        text=True,timeout=110,check=False)
    check(run.returncode==0,"QA_RECOVERY_WRANGLER_READ_FAILED")
    return load_json_output(run.stdout)
def data_result(payload):
    if isinstance(payload,dict) and "result" in payload:return payload["result"]
    return payload
def base36(n):
    chars="0123456789abcdefghijklmnopqrstuvwxyz";out=""
    while n:n,r=divmod(n,36);out=chars[r]+out
    return out
def reconstruct(v):
    m=v["metadata"]
    check(isinstance(m,dict) and m.get("sourceFileId")==FILE and
        m.get("stagedLayer")=="map" and m.get("status")=="active" and
        m.get("contentType")=="document-map" and
        isinstance(m.get("sourceFingerprint"),str) and len(m["sourceFingerprint"])==64 and
        type(m.get("stagedGeneration")) is int and m["stagedGeneration"]>=1 and
        type(m.get("mapVersion")) is int and m["mapVersion"]==4 and
        type(m.get("page")) is int and m["page"]>=1 and
        type(m.get("pageEnd")) is int and m["pageEnd"]>=m["page"] and
        isinstance(m.get("mapNodeType"),str) and
        isinstance(m.get("text"),str) and "Summary: " in m["text"] and
        isinstance(m.get("fileName"),str) and
        isinstance(m.get("sourcePath"),str),
        "QA_RECOVERY_MAP_METADATA_INVALID")
    summary=m["text"].split("Summary: ",1)[1]
    parts=[FILE,str(m["mapVersion"]),m.get("modifiedTime") or "",
           str(m["page"]),str(m["pageEnd"]),m["mapNodeType"],
           m.get("sectionId") or "",m.get("sectionTitle") or "",summary]
    logical="map-"+hashlib.sha256("\u001f".join(parts).encode("utf-8")).hexdigest()[:40]
    epoch=m["stagedGeneration"]; fp=m["sourceFingerprint"]
    expected="v2m-"+base36(epoch)+"-"+hashlib.sha256(
        json.dumps([JOB,epoch,FILE,"map",logical,fp],
            separators=(",",":"),ensure_ascii=False).encode("utf-8")
        ).hexdigest()[:40]
    check(v.get("id")==expected,"QA_RECOVERY_MAP_PHYSICAL_ID_INVALID")
    vals=v.get("values")
    check(isinstance(vals,list) and len(vals)==768 and all(
        isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) for x in vals),
        "QA_RECOVERY_MAP_EMBEDDINGS_INVALID")
    return {"stagedId":expected,"logicalId":logical,"sourceFingerprint":fp,
            "documentEpoch":epoch,"metadata":m,"values":vals}
def main():
    check(os.environ.get("GITHUB_ACTIONS")=="true" and
      os.environ.get("GITHUB_EVENT_NAME")=="push" and
      os.environ.get("GITHUB_REF")==BRANCH and
      os.environ.get("QA_RECOVERY_CONFIRMATION")=="QA_ONLY_REUSE_EXISTING_MAP_NO_GEMINI",
      "QA_RECOVERY_UNAPPROVED_CONTEXT")
    records={}
    for kind,name in INDICES.items():
        listing=data_result(run_wrangler("list-vectors",name,"--count=1000","--json"))
        check(isinstance(listing,dict) and not listing.get("isTruncated") and
          isinstance(listing.get("vectors"),list),"QA_RECOVERY_TRUNCATED_VECTOR_LIST")
        ids=[x["id"] for x in listing["vectors"] if isinstance(x,dict) and
             re.fullmatch(r"v2m-[0-9a-z]+-[a-f0-9]{40}",x.get("id",""))]
        check(0<len(ids)<=20,"QA_RECOVERY_MAP_ID_COUNT_OUT_OF_BOUNDS")
        raw=data_result(run_wrangler("get-vectors",name,"--ids",*ids))
        check(isinstance(raw,list),"QA_RECOVERY_INVALID_VECTOR_READ")
        selected=[reconstruct(v) for v in raw if isinstance(v,dict) and
                  isinstance(v.get("metadata"),dict) and
                  v["metadata"].get("sourceFileId")==FILE]
        check(len(selected)==2 and len({v["stagedId"] for v in selected})==2,
             "QA_RECOVERY_EXPECTED_TWO_REAL_MAP_VECTORS")
        records[kind]={x["stagedId"]:x for x in selected}
    ids=sorted(set(records["legacy"]) & set(records["multilingual"]))
    check(len(ids)==2 and set(records["legacy"])==set(records["multilingual"]),
          "QA_RECOVERY_DUAL_INDEX_DIVERGENCE")
    output=[]
    epochs=set(); fingerprints=set()
    for ident in ids:
        a=records["legacy"][ident]; b=records["multilingual"][ident]
        check(a["logicalId"]==b["logicalId"] and
              a["sourceFingerprint"]==b["sourceFingerprint"] and
              a["documentEpoch"]==b["documentEpoch"] and
              a["metadata"]["page"]==b["metadata"]["page"] and
              a["metadata"]["pageEnd"]==b["metadata"]["pageEnd"],
              "QA_RECOVERY_MISMATCHED_INDEX_RECORDS")
        epochs.add(a["documentEpoch"]);fingerprints.add(a["sourceFingerprint"])
        output.append({
          "stagedId":ident,"logicalId":a["logicalId"],
          "sourceFingerprint":a["sourceFingerprint"],
          "documentEpoch":a["documentEpoch"],
          "metadata":a["metadata"],
          "legacyValues":a["values"],
          "multilingualValues":b["values"],
        })
    check(len(epochs)==1 and len(fingerprints)==1,
          "QA_RECOVERY_MIXED_DOCUMENT_REVISION")
    tmp=pathlib.Path(os.environ["RUNNER_TEMP"])/"qa-issue99-map-recovery-private.json"
    tmp.write_text(json.dumps({"documentId":FILE,"records":output},separators=(",",":")),encoding="utf-8")
    tmp.chmod(0o600)
    print("QA_RECOVERY_READ_ONLY_MAP_PAIR_RECONSTRUCTED: 2 exact map IDs, valid dual-index metadata, no Gemini")
try:main()
except Exception as e:
    m=str(e)
    if not re.fullmatch(r"QA_RECOVERY_[A-Z0-9_]+",m):m="QA_RECOVERY_READBACK_PREP_FAILED"
    print("::error::"+m,file=sys.stderr)
    sys.exit(1)
