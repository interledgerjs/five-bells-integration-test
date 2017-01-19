#!/bin/bash -ex

# add hostname resolution for ilp kit test instances
KIT_HOSTS='127.0.0.1       wallet1.example
127.0.0.1       wallet2.example
127.0.0.1       wallet3.example
'
sudo -- sh -c -e "echo '$KIT_HOSTS' >> /etc/hosts"


#copy files
sudo mkdir /etc/apache2/ssl
sudo cp ssl/* /etc/apache2/ssl
sudo cp sites-available/* /etc/apache2/sites-available
sudo cp httpd.conf /etc/apache2

#enable modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod rewrite
sudo a2enmod ssl
sudo service apache2 restart

sudo a2ensite wallet1.example
sudo a2ensite wallet2.example
sudo a2ensite wallet3.example
sudo service apache2 reload
