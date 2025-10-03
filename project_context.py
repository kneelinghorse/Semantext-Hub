#!/usr/bin/env python3
"""
Project Context Manager
Maintains AI project context, sessions, and archives
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import shutil
import argparse

class ProjectContextManager:
    def __init__(self, project_root: Path = Path.cwd()):
        self.root = project_root
        self.context_file = self.root / "PROJECT_CONTEXT.json"
        self.sessions_file = self.root / "SESSIONS.jsonl"
        self.handoff_file = self.root / "AI_HANDOFF.md"
        self.archive_dir = self.root / "archive"
        self.archive_index = self.archive_dir / "INDEX.jsonl"
        
        # Create directories if they don't exist
        self.archive_dir.mkdir(exist_ok=True)
        
    def load_context(self) -> Dict[str, Any]:
        """Load the current project context"""
        if not self.context_file.exists():
            return self.create_default_context()
        
        with open(self.context_file, 'r') as f:
            return json.load(f)
    
    def save_context(self, context: Dict[str, Any]):
        """Save the project context with pretty formatting"""
        with open(self.context_file, 'w') as f:
            json.dump(context, f, indent=2)
    
    def create_default_context(self) -> Dict[str, Any]:
        """Create a default project context"""
        return {
            "project": {
                "name": "New Project",
                "version": "0.1.0",
                "description": "",
                "status": "active",
                "phase": "Initial",
                "start_date": datetime.now().isoformat()[:10],
                "deployment": {
                    "platform": "",
                    "url": "",
                    "environment": "development"
                }
            },
            "working_memory": {
                "active_domain": "",
                "session_count": 0,
                "last_session": None,
                "domains": {}
            },
            "context_health": {
                "size_kb": 0,
                "size_limit_kb": 100,
                "sessions_since_reset": 0,
                "last_reset": datetime.now().isoformat()[:10],
                "compression_enabled": False
            },
            "ai_instructions": {
                "preferred_language": "python",
                "code_style": "production_ready",
                "testing_required": True,
                "documentation_level": "comprehensive"
            }
        }
    
    def add_session(self, domain: str, deliverables: List[str], 
                   tokens_in: int = 0, tokens_out: int = 0, 
                   ai_model: str = "unknown"):
        """Log a new session to SESSIONS.jsonl"""
        context = self.load_context()
        
        # Update session count
        context["working_memory"]["session_count"] += 1
        session_num = context["working_memory"]["session_count"]
        
        # Create session entry
        session = {
            "session": session_num,
            "date": datetime.now().isoformat(),
            "domain": domain,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "deliverables": deliverables,
            "ai_model": ai_model
        }
        
        # Append to sessions file
        with open(self.sessions_file, 'a') as f:
            f.write(json.dumps(session) + '\n')
        
        # Update context
        context["working_memory"]["last_session"] = session_num
        context["context_health"]["sessions_since_reset"] += 1
        
        # Update context size
        self._update_context_size(context)
        
        self.save_context(context)
        return session_num
    
    def update_domain(self, domain_name: str, updates: Dict[str, Any]):
        """Update a working memory domain"""
        context = self.load_context()
        
        if domain_name not in context["working_memory"]["domains"]:
            context["working_memory"]["domains"][domain_name] = {
                "status": "active",
                "priority": 1,
                "critical_facts": [],
                "constraints": [],
                "decisions_made": [],
                "files_created": []
            }
        
        context["working_memory"]["domains"][domain_name].update(updates)
        context["working_memory"]["active_domain"] = domain_name
        
        self.save_context(context)
    
    def archive_domain(self, domain_name: str):
        """Archive a domain to reduce active context size"""
        context = self.load_context()
        
        if domain_name in context["working_memory"]["domains"]:
            domain_data = context["working_memory"]["domains"][domain_name]
            
            # Create archive entry
            archive_file = self.archive_dir / f"domain_{domain_name}_{datetime.now().strftime('%Y%m%d')}.json"
            with open(archive_file, 'w') as f:
                json.dump({
                    "domain": domain_name,
                    "archived_date": datetime.now().isoformat(),
                    "data": domain_data
                }, f, indent=2)
            
            # Update archive index
            with open(self.archive_index, 'a') as f:
                f.write(json.dumps({
                    "type": "domain",
                    "name": domain_name,
                    "date": datetime.now().isoformat(),
                    "file": str(archive_file.name)
                }) + '\n')
            
            # Update domain status
            context["working_memory"]["domains"][domain_name] = {
                "status": "archived",
                "archived_date": datetime.now().isoformat(),
                "archive_file": str(archive_file.name)
            }
            
            self.save_context(context)
            print(f"Archived domain '{domain_name}' to {archive_file.name}")
    
    def compress_context(self, aggressive: bool = False):
        """Compress context by archiving inactive domains"""
        context = self.load_context()
        domains = context["working_memory"]["domains"]
        
        for domain_name, domain_data in list(domains.items()):
            if isinstance(domain_data, dict) and domain_data.get("status") == "inactive":
                self.archive_domain(domain_name)
            elif aggressive and domain_name != context["working_memory"]["active_domain"]:
                # In aggressive mode, archive everything except active domain
                self.archive_domain(domain_name)
        
        # Reset if still too large
        self._update_context_size(context)
        if context["context_health"]["size_kb"] > context["context_health"]["size_limit_kb"]:
            print(f"Warning: Context size {context['context_health']['size_kb']}KB exceeds limit")
            if aggressive:
                self.reset_context(preserve_active=True)
    
    def reset_context(self, preserve_active: bool = True):
        """Reset context, optionally preserving active domain"""
        context = self.load_context()
        
        # Archive everything first
        session_num = context["working_memory"]["session_count"]
        archive_file = self.archive_dir / f"full_context_session_{session_num}.json"
        with open(archive_file, 'w') as f:
            json.dump(context, f, indent=2)
        
        # Create fresh context
        new_context = self.create_default_context()
        
        # Preserve some data
        new_context["project"] = context["project"]
        new_context["working_memory"]["session_count"] = session_num
        
        if preserve_active and context["working_memory"]["active_domain"]:
            active = context["working_memory"]["active_domain"]
            if active in context["working_memory"]["domains"]:
                new_context["working_memory"]["domains"][active] = context["working_memory"]["domains"][active]
                new_context["working_memory"]["active_domain"] = active
        
        new_context["context_health"]["last_reset"] = datetime.now().isoformat()[:10]
        
        self.save_context(new_context)
        print(f"Reset context. Previous context archived to {archive_file.name}")
    
    def update_handoff(self, next_task: str, decisions: List[str] = None, 
                      active_files: List[str] = None):
        """Update the AI handoff document"""
        context = self.load_context()
        
        handoff = f"""# AI Handoff Document
*Last Updated: Session {context['working_memory']['session_count']} - {datetime.now().strftime('%Y-%m-%d')}*

## Quick Context
- **Project**: {context['project']['name']}
- **Current Focus**: {context['working_memory']['active_domain']}
- **Next Task**: {next_task}

## Recent Decisions
"""
        
        if decisions:
            for i, decision in enumerate(decisions, 1):
                handoff += f"{i}. {decision}\n"
        else:
            handoff += "- No recent decisions recorded\n"
        
        handoff += "\n## Active Files\n"
        if active_files:
            for file in active_files:
                handoff += f"- `{file}`\n"
        else:
            handoff += "- No active files recorded\n"
        
        # Add critical constraints from active domain
        active_domain = context["working_memory"].get("active_domain")
        if active_domain and active_domain in context["working_memory"]["domains"]:
            domain = context["working_memory"]["domains"][active_domain]
            if domain.get("constraints"):
                handoff += "\n## Critical Constraints\n"
                for constraint in domain["constraints"]:
                    handoff += f"- {constraint}\n"
        
        handoff += f"\n## For Next Session\n{next_task}\n"
        
        with open(self.handoff_file, 'w') as f:
            f.write(handoff)
        
        print("Updated AI_HANDOFF.md")
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get project statistics"""
        context = self.load_context()
        
        # Count sessions
        session_count = 0
        total_tokens_in = 0
        total_tokens_out = 0
        
        if self.sessions_file.exists():
            with open(self.sessions_file, 'r') as f:
                for line in f:
                    session = json.loads(line)
                    session_count += 1
                    total_tokens_in += session.get("tokens_in", 0)
                    total_tokens_out += session.get("tokens_out", 0)
        
        return {
            "project_name": context["project"]["name"],
            "total_sessions": session_count,
            "active_domains": sum(1 for d in context["working_memory"]["domains"].values() 
                                if isinstance(d, dict) and d.get("status") == "active"),
            "context_size_kb": context["context_health"]["size_kb"],
            "total_tokens_in": total_tokens_in,
            "total_tokens_out": total_tokens_out,
            "efficiency_ratio": total_tokens_out / total_tokens_in if total_tokens_in > 0 else 0
        }
    
    def _update_context_size(self, context: Dict[str, Any]):
        """Update the context size in KB"""
        size = len(json.dumps(context).encode('utf-8')) / 1024
        context["context_health"]["size_kb"] = round(size, 2)
        
        # Check if compression needed
        if size > context["context_health"]["size_limit_kb"] * 0.8:
            context["context_health"]["compression_enabled"] = True
            print(f"Warning: Context size {size:.2f}KB approaching limit")


def main():
    parser = argparse.ArgumentParser(description="Manage AI project context")
    parser.add_argument("command", choices=[
        "init", "status", "session", "domain", "archive", 
        "compress", "reset", "handoff", "stats"
    ])
    parser.add_argument("--domain", help="Domain name")
    parser.add_argument("--deliverables", nargs="+", help="Deliverables created")
    parser.add_argument("--tokens-in", type=int, default=0, help="Tokens consumed")
    parser.add_argument("--tokens-out", type=int, default=0, help="Tokens generated")
    parser.add_argument("--model", default="claude", help="AI model used")
    parser.add_argument("--next-task", help="Next task description")
    parser.add_argument("--decisions", nargs="+", help="Decisions made")
    parser.add_argument("--files", nargs="+", help="Active files")
    parser.add_argument("--aggressive", action="store_true", help="Aggressive compression")
    
    args = parser.parse_args()
    manager = ProjectContextManager()
    
    if args.command == "init":
        context = manager.create_default_context()
        manager.save_context(context)
        print("Initialized PROJECT_CONTEXT.json")
        
    elif args.command == "status":
        context = manager.load_context()
        print(json.dumps(context, indent=2))
        
    elif args.command == "session":
        if not args.domain:
            print("Error: --domain required for session logging")
            return
        session_num = manager.add_session(
            args.domain,
            args.deliverables or [],
            args.tokens_in,
            args.tokens_out,
            args.model
        )
        print(f"Logged session {session_num}")
        
    elif args.command == "domain":
        if not args.domain:
            print("Error: --domain required")
            return
        updates = {}
        if args.deliverables:
            updates["files_created"] = args.deliverables
        if args.decisions:
            updates["decisions_made"] = args.decisions
        manager.update_domain(args.domain, updates)
        print(f"Updated domain '{args.domain}'")
        
    elif args.command == "archive":
        if not args.domain:
            print("Error: --domain required for archiving")
            return
        manager.archive_domain(args.domain)
        
    elif args.command == "compress":
        manager.compress_context(args.aggressive)
        
    elif args.command == "reset":
        manager.reset_context()
        
    elif args.command == "handoff":
        if not args.next_task:
            print("Error: --next-task required")
            return
        manager.update_handoff(args.next_task, args.decisions, args.files)
        
    elif args.command == "stats":
        stats = manager.get_statistics()
        print(f"\nProject Statistics: {stats['project_name']}")
        print(f"{'='*40}")
        print(f"Total Sessions: {stats['total_sessions']}")
        print(f"Active Domains: {stats['active_domains']}")
        print(f"Context Size: {stats['context_size_kb']}KB")
        print(f"Total Tokens In: {stats['total_tokens_in']:,}")
        print(f"Total Tokens Out: {stats['total_tokens_out']:,}")
        print(f"Efficiency Ratio: {stats['efficiency_ratio']:.2%}")


if __name__ == "__main__":
    main()
